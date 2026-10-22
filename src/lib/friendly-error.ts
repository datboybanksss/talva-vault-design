/**
 * Turns any thrown value into a sentence safe to show a user. Plain messages
 * written by our server functions pass through; validation JSON, database
 * errors, error codes and stack-like text are replaced with the fallback.
 */
const GENERIC = "Something went wrong. Please try again.";

const TECHNICAL = [
  /^\s*[[{]/, // JSON (e.g. Zod issue arrays)
  /invalid_string|invalid_type|invalid uuid|zod|"code"\s*:/i,
  /row-level security|violates|constraint|duplicate key|relation "|column "|syntax error|null value/i,
  /PGRST|JWT|fetch failed|failed to fetch|networkerror|undefined|null is not|cannot read|is not a function/i,
  /\[object |^Error: |^\w+Error\b|\bat \w+ \(/,
  /^Forbidden\b|^Unauthori[sz]ed\b|^Not found$/i,
];

export function friendlyError(error: unknown, fallback: string = GENERIC): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const message = raw.trim();
  const safeFallback = fallback || GENERIC;
  if (!message) return safeFallback;
  if (message.startsWith("TERMS_NOT_ACCEPTED")) {
    return "Please accept the current Terms & Conditions to continue.";
  }
  if (/^Forbidden|^Unauthori[sz]ed/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (message.length > 240 || TECHNICAL.some((re) => re.test(message))) return safeFallback;
  return message;
}
