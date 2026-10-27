import {
  ACCOUNT_PAUSED_CODE,
  ACCOUNT_READ_ONLY_MESSAGE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_UNAVAILABLE_MESSAGE,
} from "@/lib/account-state";

/**
 * Turns any thrown value into a sentence safe to show a user. Plain messages
 * written by our server functions pass through; validation JSON, database
 * errors, error codes and stack-like text are replaced with the fallback.
 */
const GENERIC = "Something went wrong. Please try again.";

const TECHNICAL = [
  /^\s*[[{]/, // JSON (e.g. Zod issue arrays)
  /invalid_string|invalid_type|invalid uuid|zod|"code"\s*:/i,
  /row-level security|violates|constraint|duplicate key|\brelation\b|\bcolumn\b|syntax error|null value/i,
  /SQLSTATE|\b(?:22|23|28|40|42|53|57|58|XX)[0-9A-Z]{3}\b|\bstack\b|\bat\s+.*:\d+:\d+/i,
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
  if (message.startsWith(`${ACCOUNT_PAUSED_CODE}:`)) return ACCOUNT_UNAVAILABLE_MESSAGE;
  if (message.startsWith(`${ACCOUNT_SUSPENDED_CODE}:`)) return ACCOUNT_READ_ONLY_MESSAGE;
  if (message.startsWith("TERMS_NOT_ACCEPTED")) {
    return "Please accept the current Terms & Conditions to continue.";
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "42501" || /row-level security|permission denied/i.test(message))
    return "You don't have permission to do that.";
  if (code === "23505" || /duplicate key|unique (?:constraint|violation)/i.test(message))
    return "That already exists.";
  if (
    ["23502", "23503", "23514"].includes(code) ||
    /foreign key|not.null|check (?:constraint|violation)/i.test(message)
  )
    return "We couldn't save that. Please check the details and try again.";
  if (/network|timeout|timed out|failed to fetch|fetch failed|ECONN|ENOTFOUND/i.test(message))
    return "We couldn't connect. Please try again.";
  // Our own refusals sometimes carry a machine code ("RETENTION_LOCKED: …");
  // the sentence after it is written for people, so show just that.
  const coded = /^[A-Z][A-Z0-9_]{2,}:\s*(.+)$/s.exec(message);
  if (coded) return friendlyError(capitalise(coded[1]), safeFallback);
  if (/^Forbidden|^Unauthori[sz]ed/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (message.length > 240 || TECHNICAL.some((re) => re.test(message))) return safeFallback;
  return message;
}

function capitalise(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
