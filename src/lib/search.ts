/**
 * Shared admin text search: case-insensitive, partial, trims surrounding
 * spaces, collapses inner spaces and ignores accents (é = e).
 */
export const SEARCH_MAX_LENGTH = 100;

export function normaliseSearch(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, SEARCH_MAX_LENGTH);
}

/** True when the term is empty or any field contains it. */
export function matchesSearch(
  fields: ReadonlyArray<string | null | undefined>,
  term: string,
): boolean {
  const t = normaliseSearch(term);
  if (!t) return true;
  return fields.some((f) => !!f && normaliseSearch(f).includes(t));
}

/** URL form of a search term: trimmed, or undefined when empty. */
export function searchParam(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, SEARCH_MAX_LENGTH);
  return t || undefined;
}
