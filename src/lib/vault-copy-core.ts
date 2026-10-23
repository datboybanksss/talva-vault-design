/**
 * Shared rules for the talent "Copy to agency shared folder" action.
 * Pure logic only — the server function enforces these against the database.
 */

export type CopyTargetLink = {
  id: string;
  agency_id: string;
  agency_name: string;
  status: string;
  ended_at: string | null;
};

/** A link is a valid copy target only while the relationship is active. */
export function isCopyTargetActive(link: {
  status: string;
  ended_at: string | null;
  read_until?: string | null;
}): boolean {
  if (link.status !== "accepted") return false;
  if (link.ended_at) return false;
  if (link.read_until) return false;
  return true;
}

/** Inline message when the same file was already copied to that folder. */
export function duplicateCopyMessage(documentName: string, folderLabel: string): string {
  return `A copy of ${documentName} is already in ${folderLabel}. Nothing was copied.`;
}

/** Confirmation wording shown before the copy is made. */
export function copyConfirmText(documentName: string, agencyName: string): string {
  return `A copy of ${documentName} will be added to your shared folder with ${agencyName}. Your original stays private in your vault. Once shared, the copy follows the shared folder rules and can't be removed by you.`;
}
