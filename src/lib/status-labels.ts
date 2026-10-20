/**
 * Single source of truth for status labels, tones and tab ordering.
 *
 * Never retype a status label as a literal string inside a component — import
 * from here so casing and wording stay identical across every portal.
 * Labels are sentence case (UK/SA English) per the project voice.
 */

export type StatusMeta = { key: string; label: string; tone: string };

function toMaps(list: StatusMeta[]) {
  const label: Record<string, string> = {};
  const tone: Record<string, string> = {};
  for (const s of list) {
    label[s.key] = s.label;
    tone[s.key] = s.tone;
  }
  return { label, tone };
}

/** public.agency_talent_link_status */
export const TALENT_LINK_STATUSES: StatusMeta[] = [
  { key: "active", label: "Active", tone: "green" },
  { key: "invited", label: "Invited", tone: "blue" },
  { key: "needs_review", label: "Needs review", tone: "purple" },
  { key: "expired", label: "Expired", tone: "amber" },
  { key: "read_only", label: "Read-only", tone: "teal" },
  { key: "revoked", label: "Revoked", tone: "red" },
  { key: "ended", label: "Ended", tone: "neutral" },
];

const talentLink = toMaps(TALENT_LINK_STATUSES);
export const TALENT_LINK_STATUS_LABEL = talentLink.label;
export const TALENT_LINK_STATUS_TONE = talentLink.tone;

/** Roster tab order: an "All" tab followed by every real status. */
export const TALENT_LINK_TABS: StatusMeta[] = [
  { key: "all", label: "All", tone: "neutral" },
  ...TALENT_LINK_STATUSES,
];

/** public.doc_status (quotes & invoices) plus the derived UI-only states. */
export const BILLING_DOC_STATUSES: StatusMeta[] = [
  { key: "draft", label: "Draft", tone: "neutral" },
  { key: "sent", label: "Sent", tone: "blue" },
  { key: "accepted", label: "Accepted", tone: "green" },
  { key: "declined", label: "Declined", tone: "red" },
  { key: "partial", label: "Partial", tone: "amber" },
  { key: "paid", label: "Paid", tone: "green" },
  { key: "overdue", label: "Late", tone: "red" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
];

const billing = toMaps(BILLING_DOC_STATUSES);
export const BILLING_DOC_STATUS_LABEL = billing.label;
export const BILLING_DOC_STATUS_TONE = billing.tone;

/* ------------------------------------------------------------------------- */
/* Lifecycle statuses (talent links, invitations, agencies, staff, shares).  */
/* One map for all three portals. Colours are --st-* token names, rendered   */
/* by `.tvp-status.st-<name>` in styles.css.                                 */
/* ------------------------------------------------------------------------- */

export type StToken =
  | "incomplete"
  | "invited"
  | "accepted"
  | "expired"
  | "declined"
  | "suspended"
  | "neutral";

export type StatusFamily = "talentLink" | "invitation" | "agency" | "member" | "share" | "document";

type Entry = { label: string; st: StToken };

export const LIFECYCLE_STATUS: Record<StatusFamily, Record<string, Entry>> = {
  document: {
    pending_review: { label: "Pending review", st: "incomplete" },
  },
  /** public.agency_talent_link_status */
  talentLink: {
    invited: { label: "Invited", st: "invited" },
    active: { label: "Active", st: "accepted" },
    needs_review: { label: "Needs review", st: "incomplete" },
    read_only: { label: "Read-only", st: "suspended" },
    expired: { label: "Expired", st: "expired" },
    revoked: { label: "Revoked", st: "declined" },
    ended: { label: "Ended", st: "neutral" },
  },
  /** public.invitation_status (+ admin_invitations text) with expiry derived at read time */
  invitation: {
    draft: { label: "Draft", st: "neutral" },
    pending: { label: "Invited", st: "invited" },
    expired: { label: "Expired", st: "expired" },
    accepted: { label: "Accepted", st: "accepted" },
    declined: { label: "Declined", st: "declined" },
    revoked: { label: "Revoked", st: "declined" },
  },
  /** public.agency_status */
  agency: {
    incomplete: { label: "Incomplete", st: "incomplete" },
    invited: { label: "Invited", st: "invited" },
    accepted: { label: "Accepted", st: "accepted" },
    expired: { label: "Expired", st: "expired" },
    declined: { label: "Declined", st: "declined" },
    suspended: { label: "Suspended", st: "suspended" },
  },
  /** agency_members.suspended / user_roles.suspended_at */
  member: {
    active: { label: "Active", st: "accepted" },
    suspended: { label: "Suspended", st: "suspended" },
  },
  /** loved_one_shares, derived from revoked_at / expires_at / locked_at */
  share: {
    active: { label: "Active", st: "accepted" },
    expiring: { label: "Expiring soon", st: "expired" },
    locked: { label: "Locked", st: "expired" },
    expired: { label: "Expired", st: "neutral" },
    revoked: { label: "Revoked", st: "declined" },
  },
};

const UNKNOWN: Entry = { label: "Unknown", st: "neutral" };

function entry(family: StatusFamily, status: string | null | undefined): Entry {
  return (status && LIFECYCLE_STATUS[family][status]) || UNKNOWN;
}

/** Display label — never the raw database value. */
export function statusLabel(family: StatusFamily, status: string | null | undefined): string {
  return entry(family, status).label;
}

/** --st-* token name for a status. */
export function statusToken(family: StatusFamily, status: string | null | undefined): StToken {
  return entry(family, status).st;
}

/** Full pill class: `tvp-status st-<token>`. */
export function statusPillClass(family: StatusFamily, status: string | null | undefined): string {
  return `tvp-status st-${entry(family, status).st}`;
}
