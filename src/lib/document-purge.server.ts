import { databaseError } from "./security-errors";
/**
 * Removes files queued by purge_recently_deleted_documents(). Only files of
 * documents that were never shared with a talent ever reach the queue.
 */
export async function drainDocumentStoragePurgeQueue(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("document_storage_purge_queue")
    .select("id, bucket, path")
    .is("removed_at", null)
    .limit(500);
  if (error) throw databaseError(error);
  let removed = 0;
  const byBucket = new Map<string, { ids: string[]; paths: string[] }>();
  for (const r of rows ?? []) {
    // A late finalisation may have registered a previously abandoned object.
    // Never remove a file that now has any live document reference.
    const tables = ["talent_private_documents", "talent_shared_documents", "talent_shared_document_versions", "talent_invitation_documents", "agency_compliance_documents"] as const;
    let referenced = false;
    for (const table of tables) {
      const { data: refs, error: refError } = await supabaseAdmin.from(table).select("id").eq("storage_path", r.path).limit(1);
      if (refError || refs?.length) { referenced = true; break; }
    }
    if (referenced) continue;
    const g = byBucket.get(r.bucket) ?? { ids: [], paths: [] };
    g.ids.push(r.id);
    g.paths.push(r.path);
    byBucket.set(r.bucket, g);
  }
  for (const [bucket, g] of byBucket) {
    const { error: rErr } = await supabaseAdmin.storage.from(bucket).remove(g.paths);
    if (rErr) continue;
    await supabaseAdmin
      .from("document_storage_purge_queue")
      .update({ removed_at: new Date().toISOString() })
      .in("id", g.ids);
    removed += g.ids.length;
  }
  return removed;
}
