// Shared password policy + strength scoring used by the sign-up form and
// the admin "Change password" section. The policy is:
//   • Minimum 12 characters
//   • MUST contain at least one lowercase, uppercase, number, and special character
//   • Reject common / trivially-guessable passwords (local blocklist)
//   • Server-side HIBP breach check via Supabase Auth (enabled at project level)

export const MIN_PW_LENGTH = 12;

// Small in-app blocklist of extremely common / trivially-guessable passwords.
export const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234",
  "passw0rd", "p@ssword", "p@ssw0rd", "qwerty123456", "qwertyuiop12",
  "123456789012", "1234567890123", "iloveyou1234", "letmein12345",
  "welcome12345", "adminadmin12", "administrator", "trustno1234",
  "abcdefghijkl", "aaaaaaaaaaaa", "monkey123456",
  "Password123!", "Password1234!", "Password!23", "Qwerty123!",
]);

export const PW_POLICY_HINT =
  `At least ${MIN_PW_LENGTH} characters, and must include uppercase, lowercase, a number, and a special character.`;

export type PasswordRequirements = {
  length: boolean;
  lower: boolean;
  upper: boolean;
  number: boolean;
  special: boolean;
};

export function checkRequirements(pw: string): PasswordRequirements {
  return {
    length: pw.length >= MIN_PW_LENGTH,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

export function allRequirementsMet(pw: string): boolean {
  const r = checkRequirements(pw);
  return r.length && r.lower && r.upper && r.number && r.special;
}

export type StrengthTier = "weak" | "fair" | "good" | "strong";
export type StrengthResult = {
  tier: StrengthTier;
  label: string;
  pct: number;
  color: string;
};

export function scorePassword(pw: string): StrengthResult {
  if (!pw) return { tier: "weak", label: "—", pct: 0, color: "var(--red)" };

  const req = checkRequirements(pw);
  const pool =
    (req.lower ? 26 : 0) +
    (req.upper ? 26 : 0) +
    (req.number ? 10 : 0) +
    (req.special ? 32 : 0) || 26;
  let entropy = pw.length * Math.log2(pool);
  const uniq = new Set(pw).size;
  if (uniq < 4) entropy *= 0.55;
  if (/^(.)\1+$/.test(pw)) entropy *= 0.3;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) entropy = Math.min(entropy, 20);

  const pct = Math.max(4, Math.min(100, Math.round((entropy / 80) * 100)));

  // If any required class is missing, cap at weak — the form won't accept it either.
  if (!allRequirementsMet(pw))
    return { tier: "weak", label: "Weak", pct, color: "var(--red)" };
  if (entropy < 48) return { tier: "fair", label: "Fair", pct, color: "var(--amber)" };
  if (entropy < 64) return { tier: "good", label: "Good", pct, color: "var(--teal-2)" };
  return { tier: "strong", label: "Strong", pct, color: "var(--green)" };
}

export function validateNewPassword(pw: string): string | null {
  const r = checkRequirements(pw);
  if (!r.length) return `Password must be at least ${MIN_PW_LENGTH} characters.`;
  const missing: string[] = [];
  if (!r.upper) missing.push("an uppercase letter");
  if (!r.lower) missing.push("a lowercase letter");
  if (!r.number) missing.push("a number");
  if (!r.special) missing.push("a special character");
  if (missing.length) return `Password must include ${missing.join(", ")}.`;
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
