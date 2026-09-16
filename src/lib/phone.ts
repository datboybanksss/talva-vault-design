/**
 * Shared international (E.164) phone-number handling.
 *
 * No phone library is bundled in this project, so we normalise to E.164 and
 * validate against the ITU shape: a leading `+`, a non-zero country digit and
 * 7–14 further digits. Spaces, dashes, dots and brackets are accepted while
 * typing and stripped before validation/storage.
 */

/** Strips formatting characters so "+27 82 123 4567" becomes "+27821234567". */
export function normalisePhone(raw: string): string {
  return (raw ?? "").replace(/[\s().\-\u2010-\u2015]/g, "").trim();
}

const E164 = /^\+[1-9]\d{7,14}$/;

/** True when the value is a well-formed international number. */
export function isValidPhone(raw: string): boolean {
  return E164.test(normalisePhone(raw));
}

export const PHONE_FORMAT_MESSAGE =
  "Enter a valid international number, including the country code — for example +27 82 123 4567.";

/**
 * Returns an inline error message, or null when the value is acceptable.
 * Empty values are treated as valid here; requiredness is enforced separately.
 */
export function phoneError(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  return isValidPhone(v) ? null : PHONE_FORMAT_MESSAGE;
}
