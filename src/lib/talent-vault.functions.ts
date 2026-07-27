import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "talent-private-documents";

/**
 * List the caller's private folder tree + documents.
 */
export const listPrivateVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [foldersRes, docsRes] = await Promise.all([
      supabase
        .from("talent_private_folders")
        .select("id, parent_id, name, icon, tone, sort_order, created_at")
        .eq("user_id", userId)
        .is("removed_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("talent_private_documents")
        .select(
          "id, folder_id, name, storage_path, mime_type, size_bytes, reminder_at, expires_at, notes, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (foldersRes.error) throw new Error(foldersRes.error.message);
    if (docsRes.error) throw new Error(docsRes.error.message);
    return { folders: foldersRes.data ?? [], documents: docsRes.data ?? [] };
  });

const CreateFolderInput = z.object({
  name: z.string().trim().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  tone: z.string().trim().max(20).nullable().optional(),
});

export const createPrivateFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parentFilter = supabase
      .from("talent_private_folders")
      .select("sort_order")
      .eq("user_id", userId);
    const { data: maxRow } = await (data.parent_id
      ? parentFilter.eq("parent_id", data.parent_id)
      : parentFilter.is("parent_id", null))
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data: row, error } = await supabase
      .from("talent_private_folders")
      .insert({
        user_id: userId,
        parent_id: data.parent_id ?? null,
        name: data.name,
        icon: data.icon ?? null,
        tone: data.tone ?? null,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const DeleteFolderInput = z.object({ id: z.string().uuid() });

/**
 * Top-level categories are SOFT-removed (hidden) so they can be restored later
 * from Settings → Vault Folders with their documents intact.
 * Subfolders are hard-deleted, but only when they hold no documents and no children.
 */
export const deletePrivateFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: folder } = await supabase
      .from("talent_private_folders")
      .select("id, parent_id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!folder || folder.user_id !== userId) throw new Error("Folder not found.");

    // Top-level category → soft remove (recoverable)
    if (!folder.parent_id) {
      const { error } = await supabase
        .from("talent_private_folders")
        .update({ removed_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, soft: true };
    }

    // Subfolder → hard delete only when empty
    const { data: children } = await supabase
      .from("talent_private_folders")
      .select("id")
      .eq("user_id", userId)
      .eq("parent_id", data.id)
      .limit(1);
    if ((children ?? []).length > 0) {
      throw new Error("This folder still contains subfolders. Remove those first.");
    }

    const { data: docs } = await supabase
      .from("talent_private_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("folder_id", data.id)
      .limit(1);
    if ((docs ?? []).length > 0) {
      throw new Error("This folder still contains documents. Delete or move them first.");
    }

    const { error } = await supabase
      .from("talent_private_folders")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, soft: false };
  });

const CreateUploadUrlInput = z.object({
  file_name: z.string().trim().min(1).max(240),
  folder_id: z.string().uuid().nullable().optional(),
  mime_type: z.string().trim().max(160).nullable().optional(),
  size_bytes: z.number().int().nonnegative().max(50 * 1024 * 1024).nullable().optional(),
});

/**
 * Mint a signed upload URL for the caller under their own user prefix, then
 * insert the document row (client uploads to the signed URL).
 */
export const createPrivateUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateUploadUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const safeName = data.file_name.replace(/[^\w.\-]+/g, "_");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (sErr) throw new Error(sErr.message);

    const { data: row, error: iErr } = await supabase
      .from("talent_private_documents")
      .insert({
        user_id: userId,
        folder_id: data.folder_id ?? null,
        name: data.file_name,
        storage_path: path,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);

    return { document_id: row.id, upload: signed, storage_path: path };
  });

const DocIdInput = z.object({ id: z.string().uuid() });

export const getPrivateDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DocIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("talent_private_documents")
      .select("id, name, storage_path, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) throw new Error("Not found.");
    if (!doc.storage_path) throw new Error("No file attached.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 30, { download: doc.name });
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, name: doc.name };
  });

export const deletePrivateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DocIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("talent_private_documents")
      .select("id, storage_path, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) throw new Error("Not found.");

    const { error } = await supabase
      .from("talent_private_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (doc.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]);
    }
    return { ok: true };
  });

const MoveDocInput = z.object({
  id: z.string().uuid(),
  folder_id: z.string().uuid().nullable(),
});

export const movePrivateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MoveDocInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("talent_private_documents")
      .update({ folder_id: data.folder_id })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RestoreDefaultInput = z.object({ name: z.string().trim().min(1).max(120) });

/**
 * Re-create a deleted default top-level category with its full recommended
 * subfolder set (including the "Other" catch-all). No-op if it already exists.
 */
export const restoreDefaultFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RestoreDefaultInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { DEFAULT_CATEGORIES } = await import("./talent-vault-defaults");
    const cat = DEFAULT_CATEGORIES.find((c) => c.name === data.name);
    if (!cat) throw new Error("Unknown default category.");

    const { data: existing } = await supabase
      .from("talent_private_folders")
      .select("id")
      .eq("user_id", userId)
      .is("parent_id", null)
      .eq("name", cat.name)
      .maybeSingle();
    if (existing?.id) return { id: existing.id, restored: false };

    const { data: top, error: topErr } = await supabase
      .from("talent_private_folders")
      .insert({
        user_id: userId,
        parent_id: null,
        name: cat.name,
        icon: cat.icon,
        tone: cat.tone,
        sort_order: cat.sort_order,
      })
      .select("id")
      .single();
    if (topErr) throw new Error(topErr.message);

    const rows: Array<{ user_id: string; parent_id: string; name: string; sort_order: number }> = [];
    let order = 0;
    for (const child of cat.children ?? []) {
      rows.push({ user_id: userId, parent_id: top.id, name: child, sort_order: order++ });
    }
    if (rows.length) {
      const { error } = await supabase.from("talent_private_folders").insert(rows);
      if (error) throw new Error(error.message);
    }

    let groupOrder = 0;
    for (const group of cat.groups ?? []) {
      const { data: g, error: gErr } = await supabase
        .from("talent_private_folders")
        .insert({ user_id: userId, parent_id: top.id, name: group.name, sort_order: groupOrder++ })
        .select("id")
        .single();
      if (gErr) throw new Error(gErr.message);
      const kids = group.children.map((name, i) => ({
        user_id: userId,
        parent_id: g.id,
        name,
        sort_order: i,
      }));
      if (kids.length) {
        const { error } = await supabase.from("talent_private_folders").insert(kids);
        if (error) throw new Error(error.message);
      }
    }

    const otherOrder = cat.groups?.length ? 99 : order;
    const { error: otherErr } = await supabase
      .from("talent_private_folders")
      .insert({ user_id: userId, parent_id: top.id, name: "Other", sort_order: otherOrder });
    if (otherErr) throw new Error(otherErr.message);

    return { id: top.id, restored: true };
  });
