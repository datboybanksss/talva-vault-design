// Server-only: removes the ID / proof-of-talent files held for an independent
// talent invitation once it is revoked or has expired, so "no details were
// kept" is true. The invitation row itself stays for the audit trail.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "talent-invite-docs";

export async function purgeIndependentInviteDocuments(
  invitationId: string,
  reason: "revoked" | "expired",
  actor: { id: string | null; email: string | null } = { id: null, email: null },
) {
  const { data: docs } = await supabaseAdmin
    .from("talent_invitation_documents")
    .select("id, storage_path, doc_slot")
    .eq("invitation_id", invitationId);
  const rows = docs ?? [];
  if (rows.length === 0) return { removed: 0 };

  const paths = rows.map((d) => d.storage_path).filter(Boolean) as string[];
  if (paths.length) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
    if (error) throw new Error(`Could not remove invitation files: ${error.message}`);
  }
  await supabaseAdmin.from("talent_invitation_documents").delete().eq("invitation_id", invitationId);

  const { data: inv } = await supabaseAdmin
    .from("independent_talent_invitations")
    .select("talent_name")
    .eq("id", invitationId)
    .maybeSingle();
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: actor.id,
    actor_email: actor.email ?? (actor.id ? null : "system"),
    action: "purge_independent_talent_invitation_documents",
    target_type: "independent_talent_invitation",
    target_id: invitationId,
    target_label: inv?.talent_name ?? null,
    detail: { reason, files_removed: paths.length, slots: rows.map((d) => d.doc_slot) },
  });
  return { removed: rows.length };
}

/** Daily sweep: expired or revoked invitations that still hold documents. */
export async function purgeClosedIndependentInviteDocuments() {
  const nowIso = new Date().toISOString();
  const { data: withDocs } = await supabaseAdmin
    .from("talent_invitation_documents")
    .select("invitation_id");
  const ids = Array.from(new Set((withDocs ?? []).map((d) => d.invitation_id as string)));
  if (ids.length === 0) return { invitations: 0 };
  const { data: invs } = await supabaseAdmin
    .from("independent_talent_invitations")
    .select("id, status, expires_at")
    .in("id", ids);
  let n = 0;
  for (const inv of invs ?? []) {
    const expired =
      inv.status === "expired" || (inv.status === "pending" && inv.expires_at < nowIso);
    const revoked = inv.status === "revoked";
    if (!expired && !revoked) continue;
    await purgeIndependentInviteDocuments(inv.id, revoked ? "revoked" : "expired");
    n++;
  }
  return { invitations: n };
}
