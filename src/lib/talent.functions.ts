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
    if (!doc.talent_link_id) throw new Error("Not authorised for this document.");
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

// -----------------------------------------------------------------------------
// M4 (talent side) — Document Requests fulfillment
// -----------------------------------------------------------------------------

async function getCallerLink(supabase: any, userId: string) {
  const { data: link } = await supabase
    .from("agency_talent_links")
    .select("id, agency_id, status")
    .eq("talent_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return link ?? null;
}

/**
 * Requests sent to the caller by their Manager, plus recent history.
 */
export const listTalentDocumentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const link = await getCallerLink(supabase, userId);
    if (!link) return { link: null, requests: [], history: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [reqRes, hisRes] = await Promise.all([
      supabaseAdmin
        .from("agency_document_requests")
        .select(
          "id, title, folder, instructions, status, due_date, reason_code, review_notes, reviewed_at, created_at, updated_at, current_document_id",
        )
        .eq("talent_link_id", link.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("agency_document_request_history")
        .select("id, request_id, event, document_id, reason_code, notes, created_at")
        .eq("agency_id", link.agency_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (reqRes.error) throw new Error(reqRes.error.message);

    return {
      link: { id: link.id, agency_id: link.agency_id, status: link.status },
      requests: reqRes.data ?? [],
      history: hisRes.data ?? [],
    };
  });

const RequestUploadInput = z.object({
  request_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(240),
  mime_type: z.string().trim().max(120).optional(),
});

/**
 * Reserve a signed upload URL for a talent-side response file.
 * Storage path is scoped to the caller's link so admin bucket ops stay auditable.
 */
export const createTalentRequestUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RequestUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const link = await getCallerLink(supabase, userId);
    if (!link) throw new Error("No active roster link.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("agency_document_requests")
      .select("id, agency_id, talent_link_id")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req || req.talent_link_id !== link.id) throw new Error("Request not found.");

    const safe = data.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `agency/${req.agency_id}/link/${link.id}/requests/${req.id}/${Date.now()}-${safe}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("talent-documents")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

const SubmitRequestInput = z.object({
  request_id: z.string().uuid(),
  storage_path: z.string().min(1),
  filename: z.string().min(1).max(240),
  size_bytes: z.number().int().nonnegative().optional(),
  mime_type: z.string().max(120).optional(),
});

/**
 * After the client uploads the file to the signed URL, register the file as a
 * shared document and mark the request submitted (agency reviews next).
 */
export const submitTalentDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitRequestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const link = await getCallerLink(supabase, userId);
    if (!link) throw new Error("No active roster link.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("agency_document_requests")
      .select("id, agency_id, talent_link_id, folder, title, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req || req.talent_link_id !== link.id) throw new Error("Request not found.");
    if (req.status === "completed" || req.status === "cancelled") {
      throw new Error("This request is closed.");
    }

    const { data: doc, error: dErr } = await supabaseAdmin
      .from("talent_shared_documents")
      .insert({
        agency_id: req.agency_id,
        talent_link_id: link.id,
        name: data.filename,
        folder: req.folder,
        status: "needs_review",
        storage_path: data.storage_path,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (dErr) throw new Error(dErr.message);

    // version row (v1) so agency-side history tools see the submission
    await supabaseAdmin.from("talent_shared_document_versions").insert({
      document_id: doc.id,
      version_number: 1,
      storage_path: data.storage_path,
      name: data.filename,
      size_bytes: data.size_bytes ?? null,
      mime_type: data.mime_type ?? null,
      uploaded_by: userId,
    });
    await supabaseAdmin
      .from("talent_shared_documents")
      .update({ current_version_id: null })
      .eq("id", doc.id); // trigger already refreshed locked_until

    const { error: uErr } = await supabaseAdmin
      .from("agency_document_requests")
      .update({
        status: "submitted",
        current_document_id: doc.id,
        reason_code: null,
        review_notes: null,
      })
      .eq("id", req.id);
    if (uErr) throw new Error(uErr.message);

    await supabaseAdmin.from("agency_document_request_history").insert({
      request_id: req.id,
      agency_id: req.agency_id,
      event: "submitted",
      document_id: doc.id,
      actor_id: userId,
    });

    return { ok: true, document_id: doc.id };
  });
