// Admin Reporting: real/test account scope and invitation funnel rules.
// Pure functions only — shared by admin-reporting.functions.ts and its tests.
import { matchesScope, type AccountScope } from "@/lib/account-filters";

export type { AccountScope };

/**
 * Email identity for test matching: lower-cased, trimmed, and with any
 * plus-address tag removed (talent1+run5@talvault.com → talent1@talvault.com).
 * Mirrors public.test_email_key() in the database.
 */
export function testEmailKey(email: string | null | undefined): string {
  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  const at = e.indexOf("@");
  if (at < 0) return e;
  return `${e.slice(0, at).split("+")[0]}@${e.slice(at + 1)}`;
}

export type TestScopeSource = {
  agencies: { id: string; is_test: boolean | null; contact_email?: string | null; main_contact_email?: string | null }[];
  talent: { id: string; user_id: string | null; email: string | null; is_test: boolean | null }[];
  /** Emails of people who belong to a test agency (owners and staff). */
  testAgencyMemberEmails?: (string | null | undefined)[];
};

export type TestScope = {
  scope: AccountScope;
  agencyIsTest: (id: string | null | undefined) => boolean;
  talentUserIsTest: (userId: string | null | undefined) => boolean;
  talentProfileIsTest: (profileId: string | null | undefined) => boolean;
  emailIsTest: (email: string | null | undefined) => boolean;
  /** Invitation counts as test: sending/linked agency is test, or recipient email is a test account's. */
  inviteIsTest: (inv: { email?: string | null; agency_id?: string | null }) => boolean;
  /** Whether a row whose test-ness is `isTest` belongs in the selected scope. */
  keep: (isTest: boolean) => boolean;
};

export function buildTestScope(src: TestScopeSource, scope: AccountScope): TestScope {
  const testAgencies = new Set(src.agencies.filter((a) => a.is_test).map((a) => a.id));
  const testUsers = new Set(
    src.talent.filter((t) => t.is_test && t.user_id).map((t) => t.user_id as string),
  );
  const testProfiles = new Set(src.talent.filter((t) => t.is_test).map((t) => t.id));
  const keys = new Set<string>();
  const addKey = (e: string | null | undefined) => {
    const k = testEmailKey(e);
    if (k) keys.add(k);
  };
  for (const t of src.talent) if (t.is_test) addKey(t.email);
  for (const a of src.agencies) {
    if (!a.is_test) continue;
    addKey(a.contact_email);
    addKey(a.main_contact_email);
  }
  for (const e of src.testAgencyMemberEmails ?? []) addKey(e);

  const agencyIsTest = (id: string | null | undefined) => !!id && testAgencies.has(id);
  const emailIsTest = (e: string | null | undefined) => {
    const k = testEmailKey(e);
    return !!k && keys.has(k);
  };
  return {
    scope,
    agencyIsTest,
    talentUserIsTest: (id) => !!id && testUsers.has(id),
    talentProfileIsTest: (id) => !!id && testProfiles.has(id),
    emailIsTest,
    inviteIsTest: (inv) => agencyIsTest(inv.agency_id) || emailIsTest(inv.email),
    keep: (isTest) => matchesScope(isTest, scope),
  };
}

// -----------------------------------------------------------------------------
// Invitation funnel
// -----------------------------------------------------------------------------

export type FunnelInvite = {
  status: string;
  created_at: string;
  first_sent_at?: string | null;
  accepted_at?: string | null;
};

/** An invitation counts as sent only once it has left draft. */
export function isSentInvitation(inv: { status: string }): boolean {
  return inv.status !== "draft";
}

/** When the invitation was sent (first send, falling back to creation for older rows). */
export function sentAt(inv: FunnelInvite): string {
  return inv.first_sent_at ?? inv.created_at;
}

export function sentInPeriod(inv: FunnelInvite, fromIso: string, toIso: string): boolean {
  if (!isSentInvitation(inv)) return false;
  const s = sentAt(inv);
  return s >= fromIso && s <= toIso;
}

export function daysToAccept(inv: FunnelInvite): number | null {
  if (!inv.accepted_at) return null;
  return (
    Math.round(((Date.parse(inv.accepted_at) - Date.parse(sentAt(inv))) / 86400000) * 10) / 10
  );
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

export type FunnelSummary = {
  sent: number;
  accepted: number;
  rate: number;
  medianDaysToAccept: number | null;
};

/** Sent (never drafts) in the period, how many of those were accepted, and median days. */
export function inviteFunnel(rows: FunnelInvite[], fromIso: string, toIso: string): FunnelSummary {
  const sent = rows.filter((r) => sentInPeriod(r, fromIso, toIso));
  const accepted = sent.filter((r) => r.accepted_at);
  const days = accepted.map(daysToAccept).filter((d): d is number => d != null);
  return {
    sent: sent.length,
    accepted: accepted.length,
    rate: sent.length > 0 ? Math.round((accepted.length / sent.length) * 1000) / 10 : 0,
    medianDaysToAccept: median(days),
  };
}

export const ACCOUNT_SCOPE_REPORT_LABEL: Record<AccountScope, string> = {
  real: "Real accounts",
  test: "Test accounts",
  all: "All accounts",
};
