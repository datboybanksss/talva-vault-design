/**
 * Invitation status is stored as `pending` until it is accepted/declined/revoked.
 * Nothing ever writes the `expired` value, so it must be derived at read time:
 * a pending invitation whose `expires_at` is in the past is effectively expired.
 *
 * Server functions returning invitation rows should map them through
 * `withEffectiveStatus` so every UI (tabs, counts, badges) agrees.
 */
export function effectiveInvitationStatus(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
): string {
  const s = status ?? "pending";
  if (s !== "pending" || !expiresAt) return s;
  return new Date(expiresAt).getTime() < Date.now() ? "expired" : s;
}

type StatusRow = { status?: string | null; expires_at?: string | null };

export function withEffectiveStatus<T extends StatusRow>(
  row: T,
): T & { status: string; stored_status: string } {
  const stored = row.status ?? "pending";
  return {
    ...row,
    stored_status: stored,
    status: effectiveInvitationStatus(stored, row.expires_at ?? null),
  };
}

export function mapEffectiveStatus<T extends StatusRow>(
  rows: T[] | null | undefined,
): Array<T & { status: string; stored_status: string }> {
  return (rows ?? []).map(withEffectiveStatus);
}
