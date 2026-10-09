import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseInput } from "@/lib/admin.functions";
import { ageOn, MINIMUM_TALENT_AGE } from "@/lib/terms";

/**
 * Admin → independent talent invitations (no agency). Mirrors the agency
 * onboarding draft flow: draft, two documents (ID + proof of talent), a
 * completeness gate, then send. Admins can never attach talent to an agency —
 * these invitations carry no agency at all.
 */

const BUCKET = "talent-invite-docs";
export const INDEPENDENT_DOC_SLOTS = ["id_document", "proof_of_talent"] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("We couldn't confirm your access. Please try again.");
  if (!data) throw new Error("Forbidden: admin only");
}
async function assertAdminCanEdit(supabase: any, userId: string) {
  await assertAdmin(supabase, userId);
  const { data } = await supabase.rpc("can_admin_edit", { _user_id: userId });
  if (!data) throw new Error("Forbidden: view-only administrators cannot perform this action.");
}

async function audit(supabase: any, userId: string, email: string | undefined, action: string, id: string, label: string, detail: Record<string, unknown> = {}) {
  await supabase.from("admin_audit_log").insert({
    actor_id: userId,
    actor_email: email ?? null,
    action,
    target_type: "independent_talent_invitation",
    target_id: id,
    target_label: label,
    detail,
  });
}

function effectiveStatus(row: { status: string; expires_at: string }) {
  if (row.status === "pending" && new Date(row.expires_at).getTime() < Date.now()) return "expired";
  return row.status;
}

async function inviteUrlFor(token: string) {
  const { PUBLIC_SITE_URL } = await import("@/lib/brand-email");
  return `${PUBLIC_SITE_URL}/invite/talent/${token}`;
}

/** Refuses an email that already has an account or an open invitation anywhere. */
async function assertEmailFree(email: string, excludeId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: prof } = await supabaseAdmin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (prof?.id) throw new Error(`${email} already has a TalVault account. An agency can request to connect with existing talent.`);
  let q = supabaseAdmin
    .from("independent_talent_invitations")
    .select("id, status")
    .ilike("email", email)
    .in("status", ["draft", "pending"])
    .gt("expires_at", nowIso);
  if (excludeId) q = q.neq("id", excludeId);
  const { data: openInd } = await q.limit(1);
  const { data: openAg } = await supabaseAdmin
    .from("talent_invitations")
    .select("id")
    .ilike("email", email)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .limit(1);
  if ((openInd ?? []).length || (openAg ?? []).length) {
    throw new Error(`There is already an open invitation for ${email}. Revoke or delete it before inviting again.`);
  }
}

const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

export const listIndependentTalentInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const [{ data: rows }, { data: docs }] = await Promise.all([
      supabase
        .from("independent_talent_invitations")
        .select("id, talent_name, email, talent_type, status, expires_at, created_at, accepted_at, last_sent_at, send_count, email_sent_at")
        .order("created_at", { ascending: false }),
      supabase.from("talent_invitation_documents").select("invitation_id, doc_slot"),
    ]);
    const docCount = new Map<string, number>();
    for (const d of docs ?? []) docCount.set(d.invitation_id, (docCount.get(d.invitation_id) ?? 0) + 1);
    return (rows ?? []).map((r: any) => ({
      ...r,
      status: effectiveStatus(r),
      doc_count: docCount.get(r.id) ?? 0,
    }));
  });

export const getIndependentTalentInvitation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: inv, error } = await supabase
      .from("independent_talent_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !inv) throw new Error("Invitation not found.");
    const { data: docs } = await supabase
      .from("talent_invitation_documents")
      .select("id, doc_slot, file_name, mime_type, size_bytes, created_at")
      .eq("invitation_id", data.id)
      .order("created_at");
    const { token, ...rest } = inv;
    return {
      invitation: { ...rest, status: effectiveStatus(inv) },
      documents: docs ?? [],
      invite_url: inv.status === "pending" ? await inviteUrlFor(token) : null,
    };
  });

export const createIndependentTalentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        talent_name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        talent_type: z.string().trim().max(60).optional().or(z.literal("")),
        date_of_birth: dobSchema,
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    await assertEmailFree(data.email);
    const { data: inv, error } = await supabase
      .from("independent_talent_invitations")
      .insert({
        talent_name: data.talent_name,
        email: data.email.toLowerCase(),
        talent_type: data.talent_type || null,
        date_of_birth: data.date_of_birth || null,
        status: "draft",
        invited_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error("We couldn't save the draft. Please try again.");
    await audit(supabase, userId, claims?.email, "create_independent_talent_draft", inv.id, data.talent_name, { email: data.email });
    return { id: inv.id as string };
  });

export const updateIndependentTalentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        id: z.string().uuid(),
        talent_name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        talent_type: z.string().trim().max(60).optional().or(z.literal("")),
        date_of_birth: dobSchema,
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("id, email, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found.");
    if (inv.status !== "draft") throw new Error(`This invitation is already ${inv.status} and can no longer be edited.`);
    if (data.email.toLowerCase() !== inv.email.toLowerCase()) await assertEmailFree(data.email, data.id);
    const { error } = await supabase
      .from("independent_talent_invitations")
      .update({
        talent_name: data.talent_name,
        email: data.email.toLowerCase(),
        talent_type: data.talent_type || null,
        date_of_birth: data.date_of_birth || null,
      })
      .eq("id", data.id);
    if (error) throw new Error("We couldn't save the draft. Please try again.");
    await audit(supabase, userId, claims?.email, "update_independent_talent_draft", data.id, data.talent_name);
    return { ok: true };
  });

export const recordIndependentTalentDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        invitation_id: z.string().uuid(),
        doc_slot: z.enum(INDEPENDENT_DOC_SLOTS),
        file_name: z.string().trim().min(1).max(255),
        storage_path: z.string().min(1),
        mime_type: z.string().optional(),
        size_bytes: z.number().optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const removeOrphan = () => supabase.storage.from(BUCKET).remove([data.storage_path]);
    if (!data.storage_path.startsWith(`${data.invitation_id}/`)) {
      await removeOrphan();
      throw new Error("Invalid storage path.");
    }
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("id, status, talent_name")
      .eq("id", data.invitation_id)
      .maybeSingle();
    if (!inv || inv.status !== "draft") {
      await removeOrphan();
      throw new Error("Documents can only be changed while the invitation is a draft.");
    }

    // The declared name/type/size come from the browser — verify the stored bytes.
    const { validateStoredUpload } = await import("@/lib/file-validation.server");
    await validateStoredUpload({ bucket: BUCKET, path: data.storage_path, claimedMime: data.mime_type ?? null });

    const norm = (n: string) => n.trim().toLowerCase();
    const { data: existing } = await supabase
      .from("talent_invitation_documents")
      .select("id, doc_slot, file_name")
      .eq("invitation_id", data.invitation_id);
    if ((existing ?? []).some((d: any) => norm(d.file_name) === norm(data.file_name))) {
      await removeOrphan();
      throw new Error(`A document named "${data.file_name}" has already been uploaded for this invitation.`);
    }
    if ((existing ?? []).some((d: any) => d.doc_slot === data.doc_slot)) {
      await removeOrphan();
      throw new Error("This document is already attached. Remove it first to replace it.");
    }

    const { data: row, error } = await supabase
      .from("talent_invitation_documents")
      .insert({
        invitation_id: data.invitation_id,
        doc_slot: data.doc_slot,
        file_name: data.file_name,
        storage_path: data.storage_path,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      await removeOrphan();
      throw new Error("We couldn't attach that document. Please try again.");
    }
    await audit(supabase, userId, claims?.email, "upload_independent_talent_doc", data.invitation_id, inv.talent_name, { slot: data.doc_slot });
    return { id: row.id as string };
  });

export const deleteIndependentTalentDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: doc } = await supabase
      .from("talent_invitation_documents")
      .select("id, storage_path, invitation_id, doc_slot")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("Document not found.");
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("status, talent_name")
      .eq("id", doc.invitation_id)
      .maybeSingle();
    if (inv?.status !== "draft") throw new Error("Documents can only be changed while the invitation is a draft.");
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    await supabase.from("talent_invitation_documents").delete().eq("id", data.id);
    await audit(supabase, userId, claims?.email, "delete_independent_talent_doc", doc.invitation_id, inv?.talent_name ?? "", { slot: doc.doc_slot });
    return { ok: true };
  });

export const getIndependentTalentDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: doc } = await supabase
      .from("talent_invitation_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("Document not found.");
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
    if (error || !signed) throw new Error("We couldn't open that document.");
    return { url: signed.signedUrl as string };
  });

async function sendInviteEmail(inv: { id: string; email: string; talent_name: string; token: string; expires_at: string }) {
  const { buildInvitationEmail, DEFAULT_INDEPENDENT_TALENT_INVITATION_BODY, DEFAULT_INDEPENDENT_TALENT_INVITATION_SUBJECT } =
    await import("@/lib/invitation-email");
  const { sendInvitationEmail } = await import("@/lib/invitation-email.server");
  const { fmtLongDate } = await import("@/lib/notice-email");
  const url = await inviteUrlFor(inv.token);
  const mail = buildInvitationEmail({
    variant: "independent",
    subject: DEFAULT_INDEPENDENT_TALENT_INVITATION_SUBJECT,
    body: DEFAULT_INDEPENDENT_TALENT_INVITATION_BODY,
    talentName: inv.talent_name.split(" ")[0],
    recipientEmail: inv.email,
    inviteUrl: url,
    expiryDate: fmtLongDate(inv.expires_at),
  });
  const result = await sendInvitationEmail(inv.email, mail, `independent-invite-${inv.id}-${Date.now()}`, "independent_talent_invitation");
  return { url, result };
}

export const finalizeIndependentTalentInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({ id: z.string().uuid(), expiry_days: z.number().int().min(1).max(60).default(14) }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found.");
    if (inv.status !== "draft") throw new Error(`This invitation is already ${inv.status}.`);
    const { data: docs } = await supabase
      .from("talent_invitation_documents")
      .select("doc_slot")
      .eq("invitation_id", data.id);
    const have = new Set((docs ?? []).map((d: any) => d.doc_slot));
    const missing = INDEPENDENT_DOC_SLOTS.filter((s) => !have.has(s));
    if (missing.length) throw new Error("Attach the ID document and proof of talent to send.");
    if (inv.date_of_birth && ageOn(inv.date_of_birth) < MINIMUM_TALENT_AGE) {
      throw new Error("TalVault is for adults (18 and over) at this stage, so this invitation can't be sent.");
    }
    await assertEmailFree(inv.email, inv.id);

    const expires_at = new Date(Date.now() + data.expiry_days * 86400000).toISOString();
    const { error } = await supabase
      .from("independent_talent_invitations")
      .update({ status: "pending", expires_at, last_sent_at: new Date().toISOString(), send_count: (inv.send_count ?? 0) + 1 })
      .eq("id", data.id);
    if (error) throw new Error("We couldn't send the invitation. Please try again.");

    const { url, result } = await sendInviteEmail({ ...inv, expires_at });
    if (result.sent) {
      await supabase.from("independent_talent_invitations").update({ email_sent_at: new Date().toISOString() }).eq("id", data.id);
    }
    await audit(supabase, userId, claims?.email, "send_independent_talent_invitation", data.id, inv.talent_name, {
      email: inv.email,
      expires_at,
      email_sent: result.sent,
      reason: result.sent ? null : result.reason,
    });
    return { invite_url: url, email_sent: result.sent, reason: result.sent ? null : result.reason };
  });

export const resendIndependentTalentInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid(), extend_days: z.number().int().min(1).max(60).default(14) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found.");
    if (inv.status !== "pending") {
      throw new Error(
        inv.status === "draft"
          ? "This invitation is still a draft. Attach both documents and send it first."
          : `This invitation is ${inv.status} and can no longer be resent. Create a new invitation instead.`,
      );
    }
    const expires_at = new Date(Date.now() + data.extend_days * 86400000).toISOString();
    await supabase
      .from("independent_talent_invitations")
      .update({ expires_at, last_sent_at: new Date().toISOString(), send_count: (inv.send_count ?? 0) + 1, reminder_sent_at: null })
      .eq("id", data.id);
    const { url, result } = await sendInviteEmail({ ...inv, expires_at });
    if (result.sent) {
      await supabase.from("independent_talent_invitations").update({ email_sent_at: new Date().toISOString() }).eq("id", data.id);
    }
    await audit(supabase, userId, claims?.email, "resend_independent_talent_invitation", data.id, inv.talent_name, { expires_at, email_sent: result.sent });
    return { invite_url: url, email_sent: result.sent, reason: result.sent ? null : result.reason };
  });

export const revokeIndependentTalentInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("id, status, email, talent_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found.");
    if (inv.status !== "pending") throw new Error(`Only a pending invitation can be revoked (this one is ${inv.status}).`);
    await supabase.from("independent_talent_invitations").update({ status: "revoked" }).eq("id", data.id);

    // E3 (revoked). Best effort — the domain may still be unverified.
    const { buildNoticeEmail } = await import("@/lib/notice-email");
    const { sendInvitationEmail } = await import("@/lib/invitation-email.server");
    const mail = buildNoticeEmail({
      subject: "Your TalVault invitation is no longer active",
      heading: "This invitation has closed",
      paragraphs: [`Hi ${inv.talent_name.split(" ")[0]},`, "The TalVault team has withdrawn this invitation. No account was created and no details were kept."],
      recipientEmail: inv.email,
    });
    const result = await sendInvitationEmail(inv.email, mail, `independent-revoked-${inv.id}`, "invitation_notice");
    await audit(supabase, userId, claims?.email, "revoke_independent_talent_invitation", data.id, inv.talent_name, { email_sent: result.sent });
    return { ok: true };
  });

export const deleteIndependentTalentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("id, status, talent_name, expires_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found.");
    if (!["draft", "revoked", "expired"].includes(effectiveStatus(inv))) {
      throw new Error("Only drafts and closed invitations can be deleted.");
    }
    const { data: docs } = await supabase
      .from("talent_invitation_documents")
      .select("storage_path")
      .eq("invitation_id", data.id);
    const paths = (docs ?? []).map((d: any) => d.storage_path);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    await supabase.from("independent_talent_invitations").delete().eq("id", data.id);
    await audit(supabase, userId, claims?.email, "delete_independent_talent_invitation", data.id, inv.talent_name);
    return { ok: true };
  });
