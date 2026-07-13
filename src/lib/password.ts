// Shared password policy + strength scoring used by the sign-up form and
// the admin "Change password" section. Mirrors the NIST 800-63B stance:
// length dominates, composition is not required, and the authoritative
// breach check is Supabase's HIBP verification.

export const MIN_PW_LENGTH = 12;

// Small in-app blocklist of extremely common / trivially-guessable passwords.
// Fast client-side reject so users get instant feedback rather than a round trip.
export const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234",
  "passw0rd", "p@ssword", "p@ssw0rd", "qwerty123456", "qwertyuiop12",
  "123456789012", "1234567890123", "iloveyou1234", "letmein12345",
  "welcome12345", "adminadmin12", "administrator", "trustno1234",
  "abcdefghijkl", "aaaaaaaaaaaa", "monkey123456",
]);

export type StrengthTier = "weak" | "fair" | "good" | "strong";
export type StrengthResult = {
  tier: StrengthTier;
  label: string;
  pct: number;
  color: string;
};

export function scorePassword(pw: string): StrengthResult {
  if (!pw) return { tier: "weak", label: "—", pct: 0, color: "var(--red)" };

  const pool =
    (/[a-z]/.test(pw) ? 26 : 0) +
    (/[A-Z]/.test(pw) ? 26 : 0) +
    (/[0-9]/.test(pw) ? 10 : 0) +
    (/[^a-zA-Z0-9]/.test(pw) ? 32 : 0) || 26;
  let entropy = pw.length * Math.log2(pool);
  const uniq = new Set(pw).size;
  if (uniq < 4) entropy *= 0.55;
  if (/^(.)\1+$/.test(pw)) entropy *= 0.3;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) entropy = Math.min(entropy, 20);

  const pct = Math.max(4, Math.min(100, Math.round((entropy / 80) * 100)));

  if (entropy < 28 || pw.length < MIN_PW_LENGTH)
    return { tier: "weak", label: "Weak", pct, color: "var(--red)" };
  if (entropy < 48) return { tier: "fair", label: "Fair", pct, color: "var(--amber)" };
  if (entropy < 64) return { tier: "good", label: "Good", pct, color: "var(--teal-2)" };
  return { tier: "strong", label: "Strong", pct, color: "var(--green)" };
}

export function validateNewPassword(pw: string): string | null {
  if (pw.length < MIN_PW_LENGTH) {
    return `Password must be at least ${MIN_PW_LENGTH} characters.`;
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return "That password is on the common-passwords list. Please choose a less predictable one.";
  }
  return null;
}

export function friendlyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/pwned|leaked|compromised|breached/i.test(msg))
    return "That password has appeared in a known data breach. Please choose a different one.";
  return msg;
}
