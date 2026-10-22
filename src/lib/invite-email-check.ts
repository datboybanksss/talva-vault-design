/**
 * Duplicate-email rules for every invitation path. Pure and client-safe so the
 * screens, the server and the tests share one set of messages.
 */

export const INVITE_FLOWS = [
  "admin_agency",
  "admin_talent",
  "admin_admin",
  "agency_staff",
  "agency_talent",
] as const;
export type InviteFlow = (typeof INVITE_FLOWS)[number];

export const INVITE_EMAIL_MESSAGES = {
  account:
    "This email address already has a TalVault account. You can't send another invitation to it.",
  pending:
    "An invitation has already been sent to this email address. You can resend or revoke it from Invitations.",
  staffAccount: "This email address already has a TalVault account and can't be invited as staff.",
  inviteTokenAccountExists:
    "This invitation can no longer be used because an account already exists for this email address. Please sign in.",
} as const;

export type InviteEmailConflict = {
  code: "account" | "pending";
  message: string;
  /** In-app path to the existing invitation, only where the caller may open it. */
  link: string | null;
};

/** Case-insensitive, ignores surrounding spaces. */
export function normaliseInviteEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Escapes LIKE wildcards so an ilike lookup is an exact case-insensitive match. */
export function exactIlike(email: string): string {
  return normaliseInviteEmail(email).replace(/([%_\\])/g, "\\$1");
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normaliseInviteEmail(a);
  return x !== "" && x === normaliseInviteEmail(b);
}

/**
 * Agency talent invitations never look at accounts: agencies must not be able
 * to tell whether an account exists (Agency T&C §6.3). An existing talent gets
 * a connection request through the same invitation instead.
 */
export function decideInviteEmailConflict(
  flow: InviteFlow,
  facts: { hasAccount: boolean; pendingLink: string | null | false },
): InviteEmailConflict | null {
  if (facts.hasAccount && flow !== "agency_talent") {
    return {
      code: "account",
      message: flow === "agency_staff" ? INVITE_EMAIL_MESSAGES.staffAccount : INVITE_EMAIL_MESSAGES.account,
      link: null,
    };
  }
  if (facts.pendingLink !== false) {
    return { code: "pending", message: INVITE_EMAIL_MESSAGES.pending, link: facts.pendingLink };
  }
  return null;
}

type PendingRow = { id: string; status: string | null; expires_at: string | null; email: string | null };

/** A pending row blocks only while unexpired; revoked/expired/accepted never block. */
export function isBlockingInvite(row: PendingRow, email: string, now = Date.now()): boolean {
  if (row.status !== "pending" || !sameEmail(row.email, email)) return false;
  return !row.expires_at || new Date(row.expires_at).getTime() > now;
}
