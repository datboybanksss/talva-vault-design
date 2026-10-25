import { UploadRejected, validateStoredUpload } from "./file-validation.server";
import { reasonForRejection, type QuarantineReason } from "./document-quarantine";

const QUARANTINE_SOURCES = [
  ["talent_private_documents", "talent-private-documents"],
  ["talent_shared_documents", "talent-documents"],
  ["talent_shared_document_versions", "talent-documents"],
  ["talent_invitation_documents", "talent-invite-docs"],
  ["agency_compliance_documents", "agency-compliance-docs"],
] as const;

/**
 * Re-runs the file checker on unvalidated, settled rows (never uploads still in
 * progress) and records why each is blocked. Never deletes rows or files.
 */
export async function recordQuarantineReasons(): Promise<
  Array<{ table: string; id: string; outcome: QuarantineReason | "validated"; detail: string }>
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: Array<{ table: string; id: string; outcome: QuarantineReason | "validated"; detail: string }> = [];
  for (const [table, bucket] of QUARANTINE_SOURCES) {
    let query = supabaseAdmin.from(table).select("id, storage_path").is("validated_at", null).limit(200);
    if (table === "talent_private_documents") query = query.is("validation_pending_since", null);
    const { data, error } = await query;
    if (error) throw new Error("The file check could not be completed.");
    for (const doc of (data ?? []) as Array<{ id: string; storage_path: string | null }>) {
      let reason: QuarantineReason;
      let detail: string;
      if (!doc.storage_path) {
        reason = "failed_check";
        detail = "NO_FILE: the record has no stored file";
      } else {
        try {
          const result = await validateStoredUpload({ bucket, path: doc.storage_path, removeOnFailure: false });
          await supabaseAdmin.from(table).update({ mime_type: result.mimeType, size_bytes: result.sizeBytes, validated_at: new Date().toISOString(), quarantine_reason: null } as never).eq("id", doc.id).is("validated_at", null);
          out.push({ table, id: doc.id, outcome: "validated", detail: result.kind });
          continue;
        } catch (e) {
          const code = e instanceof UploadRejected ? e.code : "UPLOAD_MISSING";
          reason = reasonForRejection(code);
          detail = code;
        }
      }
      const { error: upErr } = await supabaseAdmin.from(table).update({ quarantine_reason: reason } as never).eq("id", doc.id).is("validated_at", null);
      if (upErr) throw new Error("The file check could not record its result.");
      out.push({ table, id: doc.id, outcome: reason, detail });
    }
  }
  return out;
}

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
  const { data, error } = await supabaseAdmin.rpc("queue_abandoned_private_uploads", { _cutoff: cutoff });
  if (error) throw new Error("The upload cleanup could not be completed.");
  const { data: orphaned, error: orphanError } = await supabaseAdmin.rpc("queue_abandoned_upload_objects", { _cutoff: cutoff });
  if (orphanError) throw new Error("The upload cleanup could not be completed.");
  const { drainDocumentStoragePurgeQueue } = await import("./document-purge.server");
  await drainDocumentStoragePurgeQueue();
  return (data ?? 0) + (orphaned ?? 0);
}