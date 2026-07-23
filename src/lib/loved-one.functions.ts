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
      .select("id, loved_one_name, loved_one_email, relationship, expires_at, revoked_at, view_count, last_viewed_at, scope, note, token, created_at, is_active")
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
  private_folder_ids: z.array(z.string().uuid()).default([]),
  private_document_ids: z.array(z.string().uuid()).default([]),
  note: z.string().max(1000).optional(),
});

export const createLovedOneShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateShareInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const talentId = await ensureTalentProfile(supabase, userId);

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
        scope: {
          private_folder_ids: data.private_folder_ids,
          private_document_ids: data.private_document_ids,
        },
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);
    return row;
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

// ---- Public (magic link) ----

const TokenInput = z.object({ token: z.string().min(20).max(80) });

async function loadShareByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: share } = await supabaseAdmin
    .from("loved_one_shares")
    .select("id, talent_id, loved_one_name, loved_one_email, relationship, expires_at, revoked_at, is_active, scope, note, created_at, created_by")
    .eq("token", token)
    .maybeSingle();
  if (!share) return null;
  if (share.revoked_at || share.is_active === false) return { ...share, _invalid: "revoked" as const };
  if (new Date(share.expires_at).getTime() < Date.now()) return { ...share, _invalid: "expired" as const };
  return share;
}

export const getLovedOneShareByToken = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    const share = await loadShareByToken(data.token);
    if (!share) return { status: "not_found" as const };
    if ("_invalid" in share) {
      return { status: share._invalid, sharer: null, documents: [], folders: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folderIds: string[] = share.scope?.private_folder_ids ?? [];
    const docIds: string[] = share.scope?.private_document_ids ?? [];

    const [folders, docsInFolders, singleDocs, sharer] = await Promise.all([
      folderIds.length
        ? supabaseAdmin.from("talent_private_folders").select("id, name").in("id", folderIds)
        : Promise.resolve({ data: [] as any[] }),
      folderIds.length
        ? supabaseAdmin.from("talent_private_documents")
            .select("id, name, folder_id, mime_type, size_bytes, created_at")
            .in("folder_id", folderIds)
        : Promise.resolve({ data: [] as any[] }),
      docIds.length
        ? supabaseAdmin.from("talent_private_documents")
            .select("id, name, folder_id, mime_type, size_bytes, created_at")
            .in("id", docIds)
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin.from("talent_profiles").select("full_name").eq("id", share.talent_id).maybeSingle(),
    ]);

    const dedup = new Map<string, any>();
    for (const d of docsInFolders.data ?? []) dedup.set(d.id, d);
    for (const d of singleDocs.data ?? []) dedup.set(d.id, d);

    // Log view
    await supabaseAdmin.from("loved_one_shares").update({
      last_viewed_at: new Date().toISOString(),
      view_count: (await supabaseAdmin.from("loved_one_shares").select("view_count").eq("id", share.id).single()).data!.view_count + 1,
    }).eq("id", share.id);

    return {
      status: "ok" as const,
      share: {
        loved_one_name: share.loved_one_name,
        relationship: share.relationship,
        expires_at: share.expires_at,
        note: share.note,
      },
      sharer: { full_name: sharer.data?.full_name ?? "TalVault user" },
      folders: folders.data ?? [],
      documents: Array.from(dedup.values()),
    };
  });

export const getLovedOneDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    token: z.string().min(20).max(80),
    document_id: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data }) => {
    const share = await loadShareByToken(data.token);
    if (!share || "_invalid" in share) throw new Error("This link is no longer valid.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: doc } = await supabaseAdmin
      .from("talent_private_documents")
      .select("id, name, folder_id, storage_path, user_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (!doc || !doc.storage_path) throw new Error("Document not found.");

    // Verify document belongs to sharer AND is within scope
    if (doc.user_id !== share.created_by) throw new Error("Not authorised.");
    const folderIds: string[] = share.scope?.private_folder_ids ?? [];
    const docIds: string[] = share.scope?.private_document_ids ?? [];
    const inScope =
      docIds.includes(doc.id) ||
      (doc.folder_id != null && folderIds.includes(doc.folder_id));
    if (!inScope) throw new Error("This document isn't in the share scope.");

    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 15, { download: doc.name });
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, name: doc.name };
  });
