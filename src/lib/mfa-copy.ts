/**
 * Client-safe sign-in code facts and wording. The server imports the same
 * numbers, so the copy can never disagree with the real expiry.
 */
export const CODE_TTL_MINUTES = 10;
export const CODE_LENGTH = 6;

/** l•••@talvault.com — never show the full address on screen. */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim();
  const [name, domain] = value.split("@");
  if (!name || !domain) return "your email address";
  return `${name.slice(0, 1)}•••@${domain}`;
}

export const SIGN_IN_CODE_EXPIRY = `The code expires after ${CODE_TTL_MINUTES} minutes and can only be used once.`;
export const SIGN_IN_CODE_MISSING =
  "Can't see it? Check your spam or junk folder, or request a new code.";
