/**
 * Documents the file checker refused. They stay listed for the people who
 * could already see them, with a status, but can never be opened, previewed,
 * downloaded, copied, shared or analysed. Uploads still being checked are not
 * quarantined (quarantine_reason stays null until the checker decides).
 */
export type QuarantineReason = "blocked_type" | "failed_check";

export const QUARANTINE_LABEL = "Blocked for security";

export const QUARANTINE_CODES: Record<QuarantineReason, string> = {
  blocked_type: "DOCUMENT_BLOCKED_TYPE",
  failed_check: "DOCUMENT_FAILED_CHECK",
};

export const QUARANTINE_MESSAGES: Record<QuarantineReason, string> = {
  blocked_type:
    "This file can't be opened for security reasons. Its file type can contain code, so we don't allow it. Please upload it again as a PDF or image.",
  failed_check:
    "This file can't be opened because it didn't pass our security check. It may be damaged or not match its file type. Please upload it again.",
};

type Row = { validated_at?: string | null; quarantine_reason?: string | null };

/** The reason a row is blocked, or null when it is validated or still being checked. */
export function quarantineReason(row: Row | null | undefined): QuarantineReason | null {
  if (!row || row.validated_at) return null;
  return row.quarantine_reason === "blocked_type" || row.quarantine_reason === "failed_check"
    ? row.quarantine_reason
    : null;
}

/** Rows a list should show: validated files plus blocked ones (never in-progress uploads). */
export function listableDocument(row: Row): boolean {
  return Boolean(row.validated_at) || quarantineReason(row) !== null;
}

/** Stable "CODE: message" text thrown by the server; friendlyError keeps the message. */
export function quarantineError(reason: QuarantineReason): Error {
  return new Error(`${QUARANTINE_CODES[reason]}: ${QUARANTINE_MESSAGES[reason]}`);
}

/** Throws the stable refusal for a blocked row; returns normally otherwise. */
export function assertNotQuarantined(row: Row | null | undefined): void {
  const reason = quarantineReason(row);
  if (reason) throw quarantineError(reason);
}

/** Maps a server error back to the reason, so the UI can show the right explanation. */
export function quarantineFromError(err: unknown): QuarantineReason | null {
  const text = err instanceof Error ? err.message : String(err ?? "");
  if (text.includes(QUARANTINE_CODES.blocked_type) || text === QUARANTINE_MESSAGES.blocked_type) return "blocked_type";
  if (text.includes(QUARANTINE_CODES.failed_check) || text === QUARANTINE_MESSAGES.failed_check) return "failed_check";
  return null;
}

/** File-checker rejection code -> quarantine reason. */
export function reasonForRejection(code: string): QuarantineReason {
  return code === "UPLOAD_TYPE_NOT_ALLOWED" ? "blocked_type" : "failed_check";
}
