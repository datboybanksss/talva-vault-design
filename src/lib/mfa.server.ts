import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { emailHeaderHtml, PUBLIC_SITE_URL } from "@/lib/brand-email";

/** Sign-in codes are short-lived and single use. */
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export function codeMatches(userId: string, code: string, hash: string): boolean {
  const a = Buffer.from(hashCode(userId, code));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * The sign-in code email. Deliberately contains no link to sign in with —
 * the code alone is useless without the password already entered on the
 * device that asked for it.
 */
export function buildSignInCodeEmail(code: string) {
  const subject = `${code} is your TalVault sign-in code`;

  const text = [
    `Your TalVault sign-in code is ${code}.`,
    "",
    `It expires in ${CODE_TTL_MINUTES} minutes and can only be used once.`,
    "",
    "If you didn't try to sign in, you can ignore this email — nobody can get in with your password alone.",
    "",
    PUBLIC_SITE_URL,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F5F5F1;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1F2933;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    ${emailHeaderHtml("Sign-in code")}
    <div style="padding:24px;">
      <p style="margin:0 0 14px;font-size:16px;font-weight:700;">Your sign-in code</p>
      <p style="margin:0 0 18px;line-height:1.55;color:#4B5563;">
        Enter this code on the TalVault sign-in page to finish signing in.
      </p>
      <p style="margin:0 0 18px;font-size:34px;font-weight:800;letter-spacing:8px;color:#064E58;">
        ${escapeHtml(code)}
      </p>
      <p style="margin:0 0 18px;line-height:1.55;color:#4B5563;">
        The code expires in ${CODE_TTL_MINUTES} minutes and can only be used once.
      </p>
      <p style="margin:0;font-size:12px;color:#65707A;">
        If you didn't try to sign in, you can safely ignore this email — your account stays protected.
      </p>
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}
