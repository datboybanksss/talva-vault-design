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

/**
 * Baseline talent types offered when an agency has none on its roster yet.
 * Live values from the roster are merged in ahead of these at the call site.
 */
export const BASELINE_TALENT_TYPES = ["Athlete", "Artist", "Model"] as const;
