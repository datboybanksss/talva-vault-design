/**
 * Admin onboarding files uploaded before the invitation exists. They are held
 * in onboarding_staged_uploads (service-role writes only) and attached to the
 * invitation in the same server step that saves the draft. Nothing here ever
 * creates an invitation, a token or an email.
 */
export type StagingKind = "agency" | "talent";

export const STAGING_BUCKET: Record<StagingKind, string> = {
  agency: "agency-compliance-docs",
  talent: "talent-invite-docs",
};

/** Every staged object lives under the uploading admin's own prefix. */
export function stagingPrefix(adminId: string, sessionId: string): string {
  return `staging/${adminId}/${sessionId}/`;
}

export function stagedPathOwned(path: string, adminId: string, sessionId: string): boolean {
  return path.startsWith(stagingPrefix(adminId, sessionId)) && !path.includes("..");
}

type Target =
  | { kind: "agency"; invitationId: string; agencyId: string; businessType: string }
  | { kind: "talent"; invitationId: string };

/**
 * Moves the admin's own validated staged files for this onboarding session onto
 * the invitation. Only rows owned by `adminId` are ever read, so another
 * admin's staged files can't be attached. Blocked files stay staged (and are
 * removed by the daily clean-up); they are never attached.
 */
export async function attachStagedUploads(
  adminId: string,
  sessionId: string,
  target: Target,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("onboarding_staged_uploads")
    .select("id, doc_slot, file_name, storage_path, mime_type, size_bytes, validated_at")
    .eq("admin_id", adminId)
    .eq("session_id", sessionId)
    .eq("kind", target.kind)
    .not("validated_at", "is", null)
    .order("created_at");
  if (error) {
    console.error("[onboarding-staging] read failed", error);
    throw new Error("We couldn't attach the uploaded documents. Please try again.");
  }
  const owned = (rows ?? []).filter((r) => stagedPathOwned(r.storage_path, adminId, sessionId));
  if (!owned.length) return 0;
  const base = (r: (typeof owned)[number]) => ({
    invitation_id: target.invitationId,
    doc_slot: r.doc_slot,
    file_name: r.file_name,
    storage_path: r.storage_path,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    validated_at: r.validated_at,
    uploaded_by: adminId,
  });
  const insert =
    target.kind === "agency"
      ? supabaseAdmin.from("agency_compliance_documents").insert(
          owned.map((r) => ({
            ...base(r),
            agency_id: target.agencyId,
            business_type: target.businessType,
          })) as never,
        )
      : supabaseAdmin.from("talent_invitation_documents").insert(owned.map(base) as never);
  const { error: insErr } = await insert;
  if (insErr) {
    console.error("[onboarding-staging] attach failed", insErr);
    throw new Error("We couldn't attach the uploaded documents. Please try again.");
  }
  await supabaseAdmin
    .from("onboarding_staged_uploads")
    .delete()
    .in(
      "id",
      owned.map((r) => r.id),
    );
  return owned.length;
}
