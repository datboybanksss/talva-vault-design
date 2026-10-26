import { blockedReplacements } from "./onboarding-documents";

/** Called only after a replacement has passed validation and been saved. */
export async function removeBlockedStagedReplacement(
  adminId: string,
  sessionId: string | undefined,
  kind: "agency" | "talent",
  slot: string,
  name: string,
) {
  if (!sessionId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { STAGING_BUCKET, stagedPathOwned } = await import("./onboarding-staging.server");
  const { data: rows, error } = await supabaseAdmin.from("onboarding_staged_uploads")
    .select("id, doc_slot, file_name, storage_path, quarantine_reason")
    .eq("admin_id", adminId).eq("session_id", sessionId).eq("kind", kind);
  if (error) throw new Error("We couldn't remove the replaced file. Please try again.");
  const replaced = blockedReplacements(rows ?? [], slot, name)
    .filter((row) => stagedPathOwned(row.storage_path, adminId, sessionId));
  if (!replaced.length) return;
  const { error: removalError } = await supabaseAdmin.storage.from(STAGING_BUCKET[kind])
    .remove(replaced.map((row) => row.storage_path));
  if (removalError) throw new Error("We couldn't remove the replaced file. Please try again.");
  const { error: deleteError } = await supabaseAdmin.from("onboarding_staged_uploads")
    .delete().eq("admin_id", adminId).eq("session_id", sessionId)
    .in("id", replaced.map((row) => row.id));
  if (deleteError) throw new Error("We couldn't remove the replaced file. Please try again.");
}