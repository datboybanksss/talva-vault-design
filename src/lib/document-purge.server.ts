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
