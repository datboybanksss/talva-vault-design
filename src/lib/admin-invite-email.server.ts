import {
  missingMergeFields,
  renderAdminInvite,
  standardInviteWording,
  wordingIssues,
  type AdminInviteKind,
  type AdminInviteMerge,
  type AdminInviteWording,
} from "@/lib/invitation-email";

const TABLE: Record<AdminInviteKind, string> = {
  agency: "agency_invitations",
  talent: "independent_talent_invitations",
};

export async function adminInviteUrl(kind: AdminInviteKind, token: string) {
  const { PUBLIC_SITE_URL } = await import("@/lib/brand-email");
  return kind === "agency"
    ? `${PUBLIC_SITE_URL}/invite/${token}`
    : `${PUBLIC_SITE_URL}/invite/talent/${token}`;
}

export async function adminDisplayName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  const full = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
  return (data?.display_name ?? "").trim() || full;
}

export async function mergeFor(kind: AdminInviteKind, row: any, adminName: string) {
  const { fmtLongDate } = await import("@/lib/notice-email");
  return {
    agencyName: row.agency_name ?? null,
    contactPerson: row.contact_person ?? null,
    talentName: row.talent_name ?? null,
    adminName,
    recipientEmail: row.email ?? null,
    expiryDate: row.expires_at ? fmtLongDate(row.expires_at) : null,
    inviteUrl: row.token ? await adminInviteUrl(kind, row.token) : null,
  } satisfies AdminInviteMerge;
}

/**
 * Sends an admin invitation using the wording approved on the invitation
 * (or the standard wording if none was saved), then records the exact
 * subject, HTML and plain text that went out. Resends reuse the same wording.
 */
export async function deliverAdminInvite(
  supabase: any,
  kind: AdminInviteKind,
  id: string,
  userId: string,
) {
  const { data: row, error } = await supabase.from(TABLE[kind]).select("*").eq("id", id).maybeSingle();
  if (error || !row) throw new Error("Invitation not found.");
  const merge = await mergeFor(kind, row, await adminDisplayName(supabase, userId));
  const standard = standardInviteWording(kind, merge);
  const wording: AdminInviteWording = {
    subject: row.email_subject ?? standard.subject,
    greeting: row.email_greeting ?? standard.greeting,
    message: row.email_message ?? standard.message,
  };
  // A resend of stored wording doesn't need the current admin's name.
  const issues = missingMergeFields(kind, merge).filter(
    (i) => !(i.field === "admin_name" && row.email_message),
  );
  const problems = [...issues.map((i) => i.message), ...wordingIssues(wording)];
  if (problems.length) throw new Error(`The email can't be sent yet: ${problems.join(" ")}`);

  const mail = renderAdminInvite(kind, merge, wording);
  const { sendInvitationEmail } = await import("@/lib/invitation-email.server");
  const result = await sendInvitationEmail(
    row.email,
    mail,
    `${kind}-admin-invite-${id}-${Date.now()}`,
    kind === "agency" ? "agency_invitation" : "independent_talent_invitation",
  );
  const now = new Date().toISOString();
  await supabase
    .from(TABLE[kind])
    .update({
      email_subject: wording.subject,
      email_greeting: wording.greeting,
      email_message: wording.message,
      ...(result.sent
        ? {
            sent_email_subject: mail.subject,
            sent_email_html: mail.html,
            sent_email_text: mail.text,
            sent_email_at: now,
            email_sent_at: now,
          }
        : {}),
    })
    .eq("id", id);
  return { result, url: merge.inviteUrl as string, subject: mail.subject };
}
