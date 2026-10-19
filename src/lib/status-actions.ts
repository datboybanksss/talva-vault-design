/**
 * Single source of truth for which row actions a status allows, for the
 * Admin and Agency portals. Screens filter their RowActionsMenu with these
 * helpers and server functions call the same helpers before writing, so the
 * rule is enforced in one place.
 *
 * Talent portal: intentionally absent. Talent cannot invite anyone, so it never
 * receives Resend / Revoke invite / Reinvite.
 *
 * T&C §6.3: agency helpers only ever look at the agency-visible status and
 * expiry — never whether the invited person already has an account.
 */

export type TalentLinkAction =
  | "open"
  | "resend"
  | "revoke"
  | "copy_link"
  | "reinvite"
  | "change_type"
  | "assign_manager"
  | "end_relationship"
  | "reactivate";

export type InvitationAction =
  | "continue_draft"
  | "resend"
  | "revoke"
  | "copy_link"
  | "edit_email"
  | "reinvite"
  | "delete"
  | "open_record";

export type AgencyAction = "suspend" | "reinstate";

/** Statuses a relationship may be ended from / reactivated from. */
export const END_RELATIONSHIP_FROM = ["active", "needs_review"] as const;
export const REACTIVATE_RELATIONSHIP_FROM = ["ended", "read_only"] as const;
/** Statuses where the relationship's talent type / manager can still change. */
export const EDITABLE_LINK_STATUSES = ["invited", "active", "needs_review"] as const;

export function canEndRelationship(status: string): boolean {
  return (END_RELATIONSHIP_FROM as readonly string[]).includes(status);
}
export function canReactivateRelationship(status: string): boolean {
  return (REACTIVATE_RELATIONSHIP_FROM as readonly string[]).includes(status);
}
export function canEditLink(status: string): boolean {
  return (EDITABLE_LINK_STATUSES as readonly string[]).includes(status);
}

/** Agency view of a talent relationship row. */
export function talentLinkActions(input: {
  status: string;
  /** Invitation still in date (only meaningful while status is `invited`). */
  inviteInDate?: boolean;
  isOwner: boolean;
  writable: boolean;
}): TalentLinkAction[] {
  const { status, isOwner, writable } = input;
  const canWrite = writable;
  const owner = isOwner && writable;
  const out: TalentLinkAction[] = ["open"];

  if (status === "invited") {
    const inDate = input.inviteInDate !== false;
    if (inDate) {
      if (owner) out.push("resend", "revoke");
      out.push("copy_link");
    } else if (owner) {
      out.push("reinvite");
    }
    if (canWrite) out.push("change_type");
    return out;
  }
  if (status === "expired" || status === "revoked") {
    if (owner) out.push("reinvite");
    return out;
  }
  if (canEndRelationship(status)) {
    if (canWrite) out.push("change_type", "assign_manager");
    if (owner) out.push("end_relationship");
    return out;
  }
  if (canReactivateRelationship(status)) {
    if (owner) out.push("reactivate");
    return out;
  }
  return out;
}

/** Can an invitation still be resent / revoked / edited? (stored status). */
export function invitationIsOpen(storedStatus: string | null | undefined): boolean {
  return (storedStatus ?? "pending") === "pending";
}

/**
 * Agency, talent, staff and admin invitation rows.
 * `status` is the effective status (pending past expiry → expired),
 * `storedStatus` is the database value.
 */
export function invitationActions(input: {
  status: string;
  storedStatus?: string | null;
  viewer: "agency_owner" | "agency_staff" | "admin";
  /** Agency: agency_is_writable. Admin: has edit/invite permission. */
  canWrite: boolean;
}): InvitationAction[] {
  const { status, viewer, canWrite } = input;
  const manager = viewer !== "agency_staff" && canWrite;
  const out: InvitationAction[] = [];

  switch (status) {
    case "draft":
      if (viewer === "admin" && canWrite) out.push("continue_draft", "delete");
      break;
    case "pending":
      if (manager) out.push("resend", "revoke", "edit_email");
      out.push("copy_link");
      break;
    case "expired":
    case "revoked":
    case "declined":
      if (manager) out.push("reinvite");
      if (viewer === "admin" && canWrite) out.push("delete");
      break;
    case "accepted":
      if (viewer === "admin") out.push("open_record");
      break;
  }
  return out;
}

export function agencyActions(input: { status: string; canEdit: boolean }): AgencyAction[] {
  if (!input.canEdit) return [];
  return input.status === "suspended" ? ["reinstate"] : ["suspend"];
}

/** Talent share: a new access code only on a live share. */
export function shareIsLive(status: string): boolean {
  return status === "active" || status === "expiring" || status === "locked";
}
