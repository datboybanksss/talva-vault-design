import { matchesSearch } from "@/lib/search";
import { Constants } from "@/integrations/supabase/types";
import { LIFECYCLE_STATUS, statusLabel, statusPillClass } from "@/lib/status-labels";

/** Account kinds on the Admin Accounts page. */
export const ACCOUNT_TYPES = ["agency", "talent"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  agency: "Agency",
  talent: "Talent",
};

/** Agency statuses: the database `agency_status` enum, never retyped. */
export const AGENCY_ACCOUNT_STATUSES: string[] = [
  ...Constants.public.Enums.agency_status,
  // Pause overlays any stored status (agencies.paused_at).
  "paused",
];
/**
 * Talent profiles have no status column; their status is derived from
 * `talent_profiles.activation_completed_at` (see talentAccountStatus).
 */
export const TALENT_ACCOUNT_STATUSES: string[] = Object.keys(LIFECYCLE_STATUS.talentAccount);

/** Every status an account can have, agency first, no duplicates. */
export const ACCOUNT_STATUSES: string[] = [
  ...new Set([...AGENCY_ACCOUNT_STATUSES, ...TALENT_ACCOUNT_STATUSES]),
];

export const TALENT_LINK_FILTERS = ["linked", "independent"] as const;
export type TalentLinkFilter = (typeof TALENT_LINK_FILTERS)[number] | "all";

export function talentAccountStatus(
  activationCompletedAt: string | null | undefined,
  state?: { paused_at?: string | null; suspended_at?: string | null },
): string {
  if (state?.paused_at) return "paused";
  if (state?.suspended_at) return "suspended";
  return activationCompletedAt ? "active" : "incomplete";
}

/** Agency status shown in lists: a pause overlays the stored status. */
export function agencyAccountStatus(a: { status: string; paused_at?: string | null }): string {
  return a.paused_at ? "paused" : a.status;
}

export function normaliseAccountType(v: unknown): AccountType | "all" {
  return v === "agency" || v === "talent" ? v : "all";
}
export function normaliseAccountStatus(v: unknown): string {
  return typeof v === "string" && ACCOUNT_STATUSES.includes(v) ? v : "all";
}
export function normaliseTalentLink(v: unknown): TalentLinkFilter {
  return v === "linked" || v === "independent" ? v : "all";
}

export function accountStatusLabel(type: AccountType, status: string): string {
  return statusLabel(type === "agency" ? "agency" : "talentAccount", status);
}
export function accountStatusPill(type: AccountType, status: string): string {
  return statusPillClass(type === "agency" ? "agency" : "talentAccount", status);
}
/** Label for a status filter option that may apply to either type. */
export function accountStatusOptionLabel(status: string): string {
  return AGENCY_ACCOUNT_STATUSES.includes(status)
    ? statusLabel("agency", status)
    : statusLabel("talentAccount", status);
}

export type AccountRow = {
  type: AccountType;
  status: string;
  /** Talent only: agency names of live links; empty = independent. */
  linked_agencies?: string[];
  is_test?: boolean;
  /** Text the search box matches (names, contact names, emails, linked agencies). */
  search_text?: Array<string | null | undefined>;
};

export type AccountFilters = {
  type: AccountType | "all";
  status: string;
  link: TalentLinkFilter;
  /** Real/test accounts; omitted = all. */
  scope?: "real" | "test" | "all";
  /** Search box term; empty = no search. */
  q?: string;
};

function linkMatches(r: AccountRow, link: TalentLinkFilter) {
  if (r.type !== "talent" || link === "all") return true;
  const linked = (r.linked_agencies?.length ?? 0) > 0;
  return link === "linked" ? linked : !linked;
}

/** Rows matching every filter. The link filter only applies when type is talent. */
export function filterAccounts<T extends AccountRow>(rows: T[], f: AccountFilters): T[] {
  const link = f.type === "talent" ? f.link : "all";
  return rows.filter(
    (r) =>
      (f.type === "all" || r.type === f.type) &&
      (f.status === "all" || r.status === f.status) &&
      (!f.scope || f.scope === "all" || (f.scope === "test") === !!r.is_test) &&
      linkMatches(r, link) &&
      matchesSearch(r.search_text ?? [], f.q ?? ""),
  );
}

/** Live option counts: each group counts with the other filters applied. */
export function accountOptionCounts(rows: AccountRow[], f: AccountFilters) {
  const type: Record<string, number> = {};
  for (const t of ["all", ...ACCOUNT_TYPES] as const) {
    type[t] = filterAccounts(rows, { ...f, type: t, link: t === "talent" ? f.link : "all" }).length;
  }
  const status: Record<string, number> = {};
  for (const s of ["all", ...ACCOUNT_STATUSES]) {
    status[s] = filterAccounts(rows, { ...f, status: s }).length;
  }
  const link: Record<string, number> = {};
  for (const l of ["all", ...TALENT_LINK_FILTERS] as const) {
    link[l] = filterAccounts(rows, { ...f, type: "talent", link: l }).length;
  }
  const scope: Record<string, number> = {};
  for (const sc of ["real", "test", "all"] as const) {
    scope[sc] = filterAccounts(rows, { ...f, scope: sc }).length;
  }
  return { type, status, link, scope };
}

// -----------------------------------------------------------------------------
// Real vs test accounts
// -----------------------------------------------------------------------------

/** "Accounts" filter: real only, test only, or all. Reports default to real. */
export const ACCOUNT_SCOPES = ["real", "test", "all"] as const;
export type AccountScope = (typeof ACCOUNT_SCOPES)[number];
export const ACCOUNT_SCOPE_LABEL: Record<AccountScope, string> = {
  real: "Real only",
  test: "Test only",
  all: "All accounts",
};
export function normaliseAccountScope(v: unknown, fallback: AccountScope): AccountScope {
  return v === "real" || v === "test" || v === "all" ? v : fallback;
}
export function matchesScope(isTest: boolean | null | undefined, scope: AccountScope): boolean {
  if (scope === "all") return true;
  return scope === "test" ? !!isTest : !isTest;
}
