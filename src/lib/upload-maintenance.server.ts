import { validateStoredUpload } from "./file-validation.server";

/** Non-destructive legacy checking; old files are never treated as abandoned uploads. */
export async function checkLegacyUploads(): Promise<{ checked: number; unavailable: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let checked = 0, unavailable = 0;
  const sources = [
    ["talent_private_documents", "talent-private-documents"],
    ["talent_shared_documents", "talent-documents"],
    ["talent_shared_document_versions", "talent-documents"],
    ["talent_invitation_documents", "talent-invite-docs"],
    ["agency_compliance_documents", "agency-compliance-docs"],
  ] as const;
  for (const [table, bucket] of sources) {
    let query = supabaseAdmin.from(table).select("id, storage_path").is("validated_at", null).limit(100);
    if (table === "talent_private_documents") query = query.is("validation_pending_since", null);
    const { data, error } = await query;
    if (error) throw new Error("The file check could not be completed.");
    for (const doc of data ?? []) {
      if (!doc.storage_path) continue;
      try {
        const result = await validateStoredUpload({ bucket, path: doc.storage_path, removeOnFailure: false });
        const { error: stampError } = await supabaseAdmin.from(table).update({ mime_type: result.mimeType, size_bytes: result.sizeBytes, validated_at: new Date().toISOString() }).eq("id", doc.id).is("validated_at", null);
        if (stampError) throw stampError;
        checked++;
      } catch (error) {
        console.error("[legacy-file-check]", { table, documentId: doc.id, error });
        unavailable++;
      }
    }
  }
  return { checked, unavailable };
}

/** Only new reservations carry this marker; retained legacy files are excluded. */
export async function cleanupUnvalidatedUploads(now = Date.now()): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.from("talent_private_documents")
    .select("id, storage_path").is("validated_at", null).lt("validation_pending_since", cutoff).limit(500);
  if (error) throw new Error("The upload cleanup could not be completed.");
  let removed = 0;
  for (const doc of data ?? []) {
    const { data: locked } = await supabaseAdmin.from("talent_private_documents").select("id, storage_path").eq("id", doc.id).is("validated_at", null).lt("validation_pending_since", cutoff).maybeSingle();
    if (!locked) continue;
    const { error: storageError } = await supabaseAdmin.storage.from("talent-private-documents").remove([locked.storage_path]);
    if (storageError) { console.error("[upload-cleanup]", { code: storageError.message }); continue; }
    const { error: rowError } = await supabaseAdmin.from("talent_private_documents").delete().eq("id", locked.id).is("validated_at", null).lt("validation_pending_since", cutoff);
    if (rowError) { console.error("[upload-cleanup] row", rowError); continue; }
    removed++;
  }
  return removed;
}