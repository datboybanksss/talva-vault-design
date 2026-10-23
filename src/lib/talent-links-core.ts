/**
 * Decides whether an agency link appears in the Talent portal, and how.
 * - "active": linked now — shared folder, requests, copy-to-shared, Q&I.
 * - "previous": relationship ended but still readable and something was
 *   shared — read-only "Previously shared with [agency]".
 * - null: never shown (invited/unaccepted, nothing shared, or window passed).
 */
export type LinkState = "active" | "previous" | null;

export function classifyTalentLink(l: {
  status: string;
  ended_at: string | null;
  read_until: string | null;
  shared_docs: number;
  now?: number;
}): LinkState {
  const now = l.now ?? Date.now();
  if (l.status === "active" && !l.ended_at && !l.read_until) return "active";
  // Never accepted: nothing was ever shared through it.
  if (!l.ended_at && ["invited", "needs_review", "expired"].includes(l.status)) return null;
  const readable = !l.read_until || new Date(l.read_until).getTime() > now;
  return readable && l.shared_docs > 0 ? "previous" : null;
}
