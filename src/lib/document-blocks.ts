/**
 * Why a document action is not allowed — one wording set used by the menus
 * (disabled item + explanation) and by the server (the refusal message).
 * Messages are plain UK English and safe to show as-is.
 */
export type DocBlockCode =
  | "read_only"
  | "relationship_ended"
  | "talent_owned"
  | "retention_locked"
  | "no_folder_access";

export type DocBlock = { code: DocBlockCode; message: string; nextStep?: string };

export type AgencyDocFacts = {
  originator: "agency" | "talent" | string | null;
  talentName: string | null;
  lockedUntil: string | null;
  /** Status of the agency–talent link the document sits under. */
  linkStatus: string | null;
  /** Agency account is read-only (suspended / access ended). */
  agencyReadOnly: boolean;
};

const ENDED_LINK = ["ended", "revoked", "expired"];

export function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const who = (name: string | null) => (name && name !== "Unassigned" ? name : "the talent");

/** Shared by delete and new-version style changes to an agency vault document. */
export function agencyDocumentChangeBlock(
  d: AgencyDocFacts,
  verb: "deleted" | "changed",
  now: Date = new Date(),
): DocBlock | null {
  if (d.agencyReadOnly) {
    return {
      code: "read_only",
      message: `Your agency account is read-only, so documents can't be ${verb}.`,
    };
  }
  if (d.linkStatus && ENDED_LINK.includes(d.linkStatus)) {
    return {
      code: "relationship_ended",
      message: `Your relationship with ${who(d.talentName)} has ended, so this document is view and download only.`,
      nextStep: "An agency owner can reactivate the relationship to make changes.",
    };
  }
  if (d.originator === "talent") {
    return {
      code: "talent_owned",
      message: `${who(d.talentName)} shared this document with you, so only they can ${verb === "deleted" ? "delete" : "change"} it.`,
    };
  }
  if (verb === "deleted" && d.lockedUntil && new Date(d.lockedUntil).getTime() > now.getTime()) {
    return {
      code: "retention_locked",
      message: `This document is protected until ${fmtLongDate(d.lockedUntil)}, so it can't be deleted.`,
      nextStep: "You can upload a new version instead.",
    };
  }
  return null;
}

export function agencyDocumentDeleteBlock(d: AgencyDocFacts, now: Date = new Date()) {
  return agencyDocumentChangeBlock(d, "deleted", now);
}

export const NO_FOLDER_ACCESS: DocBlock = {
  code: "no_folder_access",
  message: "This document is in a restricted folder you don't have access to, so you can't delete it.",
};

/** The full sentence shown in toasts and thrown by the server. */
export function blockText(b: DocBlock): string {
  return b.nextStep ? `${b.message} ${b.nextStep}` : b.message;
}

/** Shown whenever a document rule is created, changed or deleted. */
export const RULE_CHANGE_NOTE =
  "This applies to documents uploaded from now on. Existing documents keep their current rules.";

export const NO_OVERRIDE_MESSAGE =
  "Per-document retention overrides aren't available. Retention rules apply by folder to documents uploaded from now on.";

/** Latest of several retention end dates (each document version keeps its own). */
export function latestLock(dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const d of dates) if (d && (!best || new Date(d) > new Date(best))) best = d;
  return best;
}
