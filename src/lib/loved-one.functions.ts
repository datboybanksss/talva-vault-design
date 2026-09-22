import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "talent-private-documents";

async function ensureTalentProfile(supabase: any, userId: string) {
  const { data } = await supabase
    .from("talent_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Talent profile not found.");
  return data.id as string;
}

export const listMyLovedOneShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("loved_one_shares")
      .select(
        "id, loved_one_name, loved_one_email, relationship, expires_at, revoked_at, view_count, last_viewed_at, scope, note, token, created_at, is_active, permission, share_kind, email_sent_at, locked_at, failed_attempts",
      )
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CreateShareInput = z.object({
  loved_one_name: z.string().trim().min(1).max(120),
  loved_one_email: z.string().trim().email().max(200),
  relationship: z.string().trim().max(80).optional(),
  days: z.number().int().min(1).max(365).default(30),
  share_kind: z.enum(["folders", "document", "billing"]).default("folders"),
  permission: z.enum(["view", "download"]).default("view"),
  private_folder_ids: z.array(z.string().uuid()).default([]),
  private_document_ids: z.array(z.string().uuid()).default([]),
  note: z.string().max(1000).optional(),
  send_email: z.boolean().default(true),
});

export const createLovedOneShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateShareInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const talentId = await ensureTalentProfile(supabase, userId);

    const isBilling = data.share_kind === "billing";
    const folderIds = data.share_kind === "document" || isBilling ? [] : data.private_folder_ids;
    const docIds = isBilling
      ? []
      : data.share_kind === "document"
        ? data.private_document_ids.slice(0, 1)
        : data.private_document_ids;
    if (!isBilling && folderIds.length === 0 && docIds.length === 0) {
      throw new Error("Select at least one folder or a document to share.");
    }

    // Ownership gate: every folder/document must belong to the caller. The
    // RLS-scoped client only ever returns the caller's own rows, so a count
    // mismatch means at least one id isn't theirs.
    if (folderIds.length) {
      const { data: owned, error: fErr } = await supabase
        .from("talent_private_folders")
        .select("id")
        .in("id", folderIds)
        .eq("user_id", userId)
        .is("removed_at", null);
      if (fErr) throw new Error(fErr.message);
      if ((owned?.length ?? 0) !== new Set(folderIds).size) {
        throw new Error("One or more selected folders aren't available in your vault.");
      }
    }
    if (docIds.length) {
      const { data: owned, error: dErr } = await supabase
        .from("talent_private_documents")
        .select("id")
        .in("id", docIds)
        .eq("user_id", userId);
      if (dErr) throw new Error(dErr.message);
      if ((owned?.length ?? 0) !== new Set(docIds).size) {
        throw new Error("One or more selected documents aren't available in your vault.");
      }
    }

    const { generateAccessCode, hashAccessCode } = await import("@/lib/loved-one-access.server");

    // Insert first so we have the DB-generated token to salt the code hash with.
    const expires = new Date(Date.now() + data.days * 86400_000).toISOString();
    const { data: row, error } = await supabase
      .from("loved_one_shares")
      .insert({
        talent_id: talentId,
        created_by: userId,
        loved_one_name: data.loved_one_name,
        loved_one_email: data.loved_one_email,
        relationship: data.relationship ?? null,
        expires_at: expires,
        note: data.note ?? null,
        permission: data.permission,
        share_kind: data.share_kind,
        scope: { private_folder_ids: folderIds, private_document_ids: docIds },
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);

    const accessCode = generateAccessCode();
    const { error: hashErr } = await supabase
      .from("loved_one_shares")
      .update({ access_code_hash: hashAccessCode(accessCode, row.token) })
      .eq("id", row.id)
      .eq("created_by", userId);
    if (hashErr) throw new Error(hashErr.message);

    // ---- Notification email (never contains the access code) ----
    let email: { sent: boolean; reason?: string } = { sent: false, reason: "not_requested" };
    if (data.send_email) {
      const { buildShareEmail, sendShareEmail } = await import("@/lib/loved-one-email.server");
      const { data: prof } = await supabase
        .from("talent_profiles").select("full_name").eq("id", talentId).maybeSingle();
      const origin = process.env.PUBLIC_SITE_URL ?? "https://id-preview--f47b509e-a49f-44ed-abf5-85631a6dc162.lovable.app";
      const mail = buildShareEmail({
        lovedOneName: data.loved_one_name,
        sharerName: prof?.full_name ?? "A TalVault user",
        link: `${origin}/loved-one/${row.token}`,
        expiresAt: expires,
        itemLabel:
          data.share_kind === "document"
            ? "a document"
            : data.share_kind === "billing"
              ? "quotes and invoices"
              : "documents",
        note: data.note,
      });
      const result = await sendShareEmail(data.loved_one_email, mail);
      email = result.sent ? { sent: true } : { sent: false, reason: result.reason };
      if (result.sent) {
        await supabase.from("loved_one_shares")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", row.id).eq("created_by", userId);
      }
    }

    const { recordTalentActivity } = await import("@/lib/talent-activity.server");
    await recordTalentActivity(supabase, userId, claims?.email, "vault_document_shared", {
      targetType: "loved_one_share",
      targetId: row.id,
      targetLabel: data.loved_one_name,
      detail: { share_kind: data.share_kind },
    });

    // access_code is returned exactly once — it is never stored in plain text.
    return { id: row.id, token: row.token, access_code: accessCode, email };
  });

export const revokeLovedOneShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("loved_one_shares")
      .update({ revoked_at: new Date().toISOString(), is_active: false })
      .eq("id", data.id)
      .eq("created_by", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mints a brand-new access code for an existing share (old one stops working). */
export const regenerateAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: share } = await supabase
      .from("loved_one_shares")
      .select("id, token, talent_id, loved_one_name, loved_one_email, expires_at")
      .eq("id", data.id)
      .eq("created_by", userId)
      .maybeSingle();
    if (!share) throw new Error("Share not found.");

    const { generateAccessCode, hashAccessCode } = await import("@/lib/loved-one-access.server");
    const accessCode = generateAccessCode();
    const { error } = await supabase
      .from("loved_one_shares")
      .update({
        access_code_hash: hashAccessCode(accessCode, share.token),
        failed_attempts: 0,
        locked_at: null,
      })
      .eq("id", share.id).eq("created_by", userId);
    if (error) throw new Error(error.message);

    // Tell the Loved One a new code was issued (the code itself is never sent).
    // Graceful no-op while the sending domain is unverified — the caller is told
    // honestly whether the email actually went out.
    let email: { sent: boolean; reason?: string } = { sent: false, reason: "send_failed" };
    try {
      const { buildRegeneratedCodeEmail } = await import("@/lib/loved-one-email.server");
      const { sendInvitationEmail } = await import("@/lib/invitation-email.server");
      const { PUBLIC_SITE_URL } = await import("@/lib/brand-email");
      const { data: prof } = share.talent_id
        ? await supabase.from("talent_profiles").select("full_name").eq("id", share.talent_id).maybeSingle()
        : { data: null as any };
      const mail = buildRegeneratedCodeEmail({
        lovedOneName: share.loved_one_name ?? share.loved_one_email,
        sharerName: prof?.full_name ?? "A TalVault user",
        link: `${PUBLIC_SITE_URL}/loved-one/${share.token}`,
        expiresAt: share.expires_at,
      });
      const res = await sendInvitationEmail(
        share.loved_one_email,
        mail,
        `loved-one-regen-${share.id}-${Date.now()}`,
        "loved_one_share",
      );
      email = res.sent ? { sent: true } : { sent: false, reason: res.reason };
      if (res.sent) {
        await supabase
          .from("loved_one_shares")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", share.id)
          .eq("created_by", userId);
      }
    } catch {
      email = { sent: false, reason: "send_failed" };
    }

    return { access_code: accessCode, email };
  });

// ---------------- Public (magic link) ----------------

const TokenInput = z.object({ token: z.string().min(20).max(80) });

async function loadShareByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: share } = await supabaseAdmin
    .from("loved_one_shares")
    .select(
      "id, talent_id, loved_one_name, loved_one_email, relationship, expires_at, revoked_at, is_active, scope, note, created_at, created_by, access_code_hash, permission, share_kind, failed_attempts, locked_at",
    )
    .eq("token", token)
    .maybeSingle();
  if (!share) return null;
  if (share.revoked_at || share.is_active === false) return { ...share, _invalid: "revoked" as const };
  if (new Date(share.expires_at).getTime() < Date.now()) return { ...share, _invalid: "expired" as const };
  if (share.locked_at) return { ...share, _invalid: "locked" as const };
  return share;
}

/**
 * Resolves a share's folder scope to the folders the recipient may actually
 * see: owner-scoped, not soft-removed, and expanded to include nested
 * subfolders of each shared folder.
 */
export async function resolveShareFolders(scopeFolderIds: string[], owner: string | null) {
  if (!owner || scopeFolderIds.length === 0) return { folders: [] as any[], folderIds: [] as string[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: all } = await supabaseAdmin
    .from("talent_private_folders")
    .select("id, name, parent_id")
    .eq("user_id", owner)
    .is("removed_at", null);
  const rows = all ?? [];
  const byId = new Map(rows.map((f: any) => [f.id, f]));
  const kept = new Map<string, any>();
  const queue = scopeFolderIds.filter((id) => byId.has(id));
  while (queue.length) {
    const id = queue.shift()!;
    if (kept.has(id)) continue;
    kept.set(id, byId.get(id));
    for (const f of rows) if (f.parent_id === id) queue.push(f.id);
  }
  return {
    folders: Array.from(kept.values()).map((f: any) => ({ id: f.id, name: f.name })),
    folderIds: Array.from(kept.keys()),
  };
}


/**
 * Billing shares expose exactly the set the talent themselves can see — the
 * quotes and invoices their Manager has shared with them. Nothing else in the
 * agency's books is reachable through a Loved One link.
 */
async function loadSharedBilling(talentId: string | null) {
  if (!talentId) return [] as any[];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: profile } = await supabaseAdmin
    .from("talent_profiles").select("user_id").eq("id", talentId).maybeSingle();
  if (!profile?.user_id) return [] as any[];

  const { data: link } = await supabaseAdmin
    .from("agency_talent_links")
    .select("agency_id, display_name")
    .eq("talent_user_id", profile.user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!link) return [] as any[];

  const { data: docs } = await supabaseAdmin
    .from("agency_billing_docs")
    .select(
      "id, kind, number, client_name, talent_name, description, issued_at, due_date, currency, notes, status, recipient_address, recipient_vat_number, recipient_email, acceptance_window_days, payment_terms_days",
    )
    .eq("agency_id", link.agency_id)
    .eq("shared_with_talent", true)
    .ilike("talent_name", link.display_name)
    .order("issued_at", { ascending: false });
  const rows = docs ?? [];
  if (rows.length === 0) return [] as any[];

  const { data: lines } = await supabaseAdmin
    .from("agency_billing_doc_lines")
    .select("doc_id, description, quantity, unit_price_cents, vat_rate_bp, sort_order")
    .in("doc_id", rows.map((r) => r.id))
    .order("sort_order", { ascending: true });

  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select(
      "name, contact_email, phone, country, business_type, billing_address, is_vat_registered, vat_number, main_contact_first_name, main_contact_last_name, main_contact_email, main_contact_phone, accent_color, default_invoice_payment_days, default_quote_acceptance_days, bank_name, bank_account_holder, bank_account_number, bank_branch_code, payment_instructions",
    )
    .eq("id", link.agency_id)
    .maybeSingle();

  const agencyDoc = { ...(agency ?? { name: "Your Manager" }), logo_url: null };

  return rows.map((doc) => ({
    doc,
    agency: agencyDoc,
    lines: (lines ?? [])
      .filter((l) => l.doc_id === doc.id)
      .map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price_cents: Number(l.unit_price_cents),
        vat_rate_bp: Number(l.vat_rate_bp),
        sort_order: Number(l.sort_order),
      })),
  }));
}

/** Exchanges the access code for a short-lived signed ticket. */
export const unlockLovedOneShare = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ token: z.string().min(20).max(80), code: z.string().trim().min(4).max(40) }).parse(i),
  )
  .handler(async ({ data }) => {
    // IP-level throttle on top of the per-share failed-attempt lock, so a
    // single caller can't sweep many share tokens (TVA-SEC-006).
    const { guardPublicToken } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({
      bucket: "loved_one_unlock",
      token: data.token,
      perIp: { max: 20, windowSeconds: 600, blockSeconds: 1800 },
      perToken: { max: 12, windowSeconds: 600, blockSeconds: 1800 },
    });
    if (!guard.allowed) return { ok: false as const, reason: "throttled" as const };

    const share = await loadShareByToken(data.token);
    if (!share) return { ok: false as const, reason: "not_found" as const };
    if ("_invalid" in share) return { ok: false as const, reason: share._invalid };
    if (!share.access_code_hash) return { ok: false as const, reason: "no_code_set" as const };

    const { accessCodeMatches, issueTicket, MAX_FAILED_ATTEMPTS } = await import("@/lib/loved-one-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!accessCodeMatches(data.code, share.access_code_hash, data.token)) {
      const attempts = (share.failed_attempts ?? 0) + 1;
      await supabaseAdmin
        .from("loved_one_shares")
        .update({
          failed_attempts: attempts,
          locked_at: attempts >= MAX_FAILED_ATTEMPTS ? new Date().toISOString() : null,
        })
        .eq("id", share.id);
      return {
        ok: false as const,
        reason: attempts >= MAX_FAILED_ATTEMPTS ? ("locked" as const) : ("bad_code" as const),
        remaining: Math.max(0, MAX_FAILED_ATTEMPTS - attempts),
      };
    }

    await supabaseAdmin.from("loved_one_shares").update({ failed_attempts: 0 }).eq("id", share.id);
    return { ok: true as const, ticket: issueTicket(share.id) };
  });

export const getLovedOneShareByToken = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => TokenInput.extend({ ticket: z.string().max(400).optional() }).parse(i))
  .handler(async ({ data }) => {
    const share = await loadShareByToken(data.token);
    if (!share) return { status: "not_found" as const };
    if ("_invalid" in share) {
      return { status: share._invalid, sharer: null, documents: [], folders: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sharerRes = share.talent_id
      ? await supabaseAdmin.from("talent_profiles").select("full_name").eq("id", share.talent_id).maybeSingle()
      : { data: null as any };
    const sharer = { full_name: sharerRes.data?.full_name ?? "A TalVault user" };

    // Gate: an access code is required and the caller must present a valid ticket.
    const { verifyTicket } = await import("@/lib/loved-one-access.server");
    if (share.access_code_hash && !verifyTicket(data.ticket, share.id)) {
      // Nothing about the documents is returned before the code is accepted.
      return {
        status: "code_required" as const,
        sharer,
        share: { loved_one_name: share.loved_one_name },
        folders: [],
        documents: [],
      };
    }

    const owner = share.created_by as string | null;
    const scopeFolderIds: string[] = (share.scope as any)?.private_folder_ids ?? [];
    const docIds: string[] = (share.scope as any)?.private_document_ids ?? [];

    // Every lookup below is owner-scoped, so a share row pointing at someone
    // else's folder or document can never surface their names or metadata.
    const { folders: sharedFolders, folderIds } = await resolveShareFolders(scopeFolderIds, owner);

    const [docsInFolders, singleDocs] = await Promise.all([
      folderIds.length && owner
        ? supabaseAdmin.from("talent_private_documents")
            .select("id, name, folder_id, mime_type, size_bytes, created_at")
            .in("folder_id", folderIds)
            .eq("user_id", owner)
        : Promise.resolve({ data: [] as any[] }),
      docIds.length && owner
        ? supabaseAdmin.from("talent_private_documents")
            .select("id, name, folder_id, mime_type, size_bytes, created_at")
            .in("id", docIds)
            .eq("user_id", owner)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const folders = { data: sharedFolders };
    const dedup = new Map<string, any>();
    for (const d of docsInFolders.data ?? []) dedup.set(d.id, d);
    for (const d of singleDocs.data ?? []) dedup.set(d.id, d);

    const billing =
      share.share_kind === "billing" ? await loadSharedBilling(share.talent_id) : [];

    const { data: counter } = await supabaseAdmin
      .from("loved_one_shares").select("view_count").eq("id", share.id).single();
    await supabaseAdmin.from("loved_one_shares").update({
      last_viewed_at: new Date().toISOString(),
      view_count: (counter?.view_count ?? 0) + 1,
    }).eq("id", share.id);

    return {
      status: "ok" as const,
      share: {
        loved_one_name: share.loved_one_name,
        loved_one_email: share.loved_one_email,
        relationship: share.relationship,
        expires_at: share.expires_at,
        note: share.note,
        permission: share.permission as "view" | "download",
        share_kind: share.share_kind as "folders" | "document" | "billing",
      },
      sharer,
      folders: folders.data ?? [],
      documents: Array.from(dedup.values()),
      billing,
    };
  });

/**
 * Authorises a document for the loved one and returns the same-origin streaming
 * URL. Download is refused server-side when the share is view-only.
 */
export const getLovedOneFileUrl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({
      token: z.string().min(20).max(80),
      ticket: z.string().max(400).optional(),
      document_id: z.string().uuid(),
      mode: z.enum(["view", "download"]).default("view"),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const share = await loadShareByToken(data.token);
    if (!share || "_invalid" in share) throw new Error("This link is no longer valid.");

    const { verifyTicket } = await import("@/lib/loved-one-access.server");
    if (share.access_code_hash && !verifyTicket(data.ticket, share.id)) {
      throw new Error("Enter the access code first.");
    }
    if (data.mode === "download" && share.permission !== "download") {
      throw new Error("This share is view-only — downloading isn't permitted.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: doc } = await supabaseAdmin
      .from("talent_private_documents")
      .select("id, name, folder_id, storage_path, user_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (!doc || !doc.storage_path) throw new Error("Document not found.");
    if (doc.user_id !== share.created_by) throw new Error("Not authorised.");

    const folderIds: string[] = (share.scope as any)?.private_folder_ids ?? [];
    const docIds: string[] = (share.scope as any)?.private_document_ids ?? [];
    const inScope = docIds.includes(doc.id) || (doc.folder_id != null && folderIds.includes(doc.folder_id));
    if (!inScope) throw new Error("This document isn't in the share scope.");

    const params = new URLSearchParams({
      token: data.token,
      doc: doc.id,
      mode: data.mode,
      ...(data.ticket ? { ticket: data.ticket } : {}),
    });
    return { url: `/api/public/loved-one-file?${params.toString()}`, name: doc.name };
  });
