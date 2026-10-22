import { LIFECYCLE_STATUS } from "@/lib/status-labels";

/** Invitation kinds shown in the Admin overview list (administrators excluded). */
export const INVITATION_TYPES = ["agency", "talent"] as const;
export type InvitationType = (typeof INVITATION_TYPES)[number];

/**
 * Every status an agency/talent invitation can have: the database
 * `invitation_status` values plus the read-time "expired" state, taken from the
 * shared status map so no list is retyped here.
 */
export const INVITATION_STATUSES = Object.keys(LIFECYCLE_STATUS.invitation);

export function normaliseInvitationType(v: unknown): InvitationType | "all" {
  return v === "agency" || v === "talent" ? v : "all";
}

export function normaliseInvitationStatus(v: unknown): string {
  return typeof v === "string" && INVITATION_STATUSES.includes(v) ? v : "all";
}

/** Counts shown beside each Type option, given the selected status. */
export function typeOptionCounts(
  counts: Record<InvitationType, Record<string, number>>,
  status: string,
): Record<InvitationType | "all", number> {
  const agency = counts.agency?.[status] ?? 0;
  const talent = counts.talent?.[status] ?? 0;
  return { all: agency + talent, agency, talent };
}

/** Counts shown beside each Status option, given the selected type. */
export function statusOptionCounts(
  counts: Record<InvitationType, Record<string, number>>,
  type: InvitationType | "all",
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of ["all", ...INVITATION_STATUSES]) {
    out[s] =
      (type !== "talent" ? (counts.agency?.[s] ?? 0) : 0) +
      (type !== "agency" ? (counts.talent?.[s] ?? 0) : 0);
  }
  return out;
}
