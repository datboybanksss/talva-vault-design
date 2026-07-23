import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Returns the talent's profile + primary agency link (or null if the caller
 * is signed in but not a talent). Used by the /talent route gate and shell.
 */
export const getTalentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("talent_profiles")
      .select("id, user_id, agency_id, full_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return { profile: null, link: null, agency: null };

    const { data: link } = await supabase
      .from("agency_talent_links")
      .select("id, agency_id, status, display_name, talent_type, created_at, ended_at")
      .eq("talent_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let agency: { id: string; name: string } | null = null;
    if (link?.agency_id) {
      const { data: a } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("id", link.agency_id)
        .maybeSingle();
      if (a) agency = a;
    }
    return { profile, link, agency };
  });

const UpdateProfileInput = z.object({
  full_name: z.string().trim().min(1).max(160),
  talent_type: z.string().trim().max(80).nullable().optional(),
});

export const updateTalentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error: pErr } = await supabase
      .from("talent_profiles")
      .update({ full_name: data.full_name })
      .eq("user_id", userId);
    if (pErr) throw new Error(pErr.message);

    if (data.talent_type !== undefined) {
      await supabase
        .from("agency_talent_links")
        .update({
          display_name: data.full_name,
          talent_type: data.talent_type,
        })
        .eq("talent_user_id", userId);
    }
    return { ok: true };
  });

/**
 * Roster Shared Folder — read-only view for the talent.
 * Returns the folder list (as defined by the agency) plus all shared documents
 * belonging to the caller's active link.
 */
export const getRosterSharedContents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: link } = await supabase
      .from("agency_talent_links")
      .select("id, agency_id, status")
      .eq("talent_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!link) return { link: null, folders: [], documents: [] };

    // Docs — talent-side SELECT policy already scopes by link
    const { data: docs, error: dErr } = await supabase
      .from("talent_shared_documents")
      .select(
        "id, name, folder, status, validity_expires_at, storage_path, uploaded_by, created_at, updated_at, locked_until, current_version_id",
      )
      .eq("talent_link_id", link.id)
      .order("created_at", { ascending: false });
    if (dErr) throw new Error(dErr.message);

    // Folders — no talent-side RLS on agency_talent_folders. Use admin after
    // verifying the caller owns this link (already done above).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folders } = await supabaseAdmin
      .from("agency_talent_folders")
      .select("id, folder_name, sort_order, retention_years")
      .eq("talent_link_id", link.id)
      .order("sort_order", { ascending: true });

    return {
      link: { id: link.id, agency_id: link.agency_id, status: link.status },
      folders: folders ?? [],
      documents: docs ?? [],
    };
  });

const DownloadInput = z.object({ document_id: z.string().uuid() });

export const getSharedDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DownloadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS ensures the caller can only SELECT their own shared docs.
    const { data: doc, error } = await supabase
      .from("talent_shared_documents")
      .select("id, name, storage_path, talent_link_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found.");
    if (!doc.storage_path) throw new Error("No file attached to this document.");

    // Double-check ownership defensively.
    const { data: link } = await supabase
      .from("agency_talent_links")
      .select("id")
      .eq("talent_user_id", userId)
      .eq("id", doc.talent_link_id)
      .maybeSingle();
    if (!link) throw new Error("Not authorised for this document.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("talent-documents")
      .createSignedUrl(doc.storage_path, 60 * 30, { download: doc.name });
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl, name: doc.name };
  });
