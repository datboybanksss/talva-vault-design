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

const RenameFolderInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export const renamePrivateFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RenameFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("talent_private_folders")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteFolderInput = z.object({ id: z.string().uuid() });

export const deletePrivateFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteFolderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Gather storage paths of documents inside this folder (and any descendants)
    // so we can clean up files after the cascade deletes the rows.
    const { data: descendants } = await supabase.rpc("noop_never_defined", {}).then(
      () => ({ data: [] as string[] }),
      () => ({ data: [] as string[] }),
    );
    void descendants;

    // Collect all descendant folder IDs client-side (simple recursion).
    const { data: allFolders } = await supabase
      .from("talent_private_folders")
      .select("id, parent_id")
      .eq("user_id", userId);
    const ids = new Set<string>([data.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of allFolders ?? []) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    const { data: docs } = await supabase
      .from("talent_private_documents")
      .select("storage_path")
      .in("folder_id", Array.from(ids));
    const paths = (docs ?? [])
      .map((d) => d.storage_path)
      .filter((p): p is string => !!p);

    const { error } = await supabase
      .from("talent_private_folders")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }
    return { ok: true };
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
