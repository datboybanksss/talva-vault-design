import { emailWhiteBrandHtml } from "@/lib/brand-email";
import { escapeHtml } from "@/lib/invitation-email";

/**
 * Branded transactional notice (link requests, relationship changes,
 * invitation reminders / closures). Carries only the person's name — never ID
 * details or other identifiers.
 */
export function buildNoticeEmail(input: {
  subject: string;
  preheader?: string;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  recipientEmail: string;
}) {
  const paras = input.paragraphs
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.55;margin:0 0 14px;">${escapeHtml(p)}</p>`,
    )
    .join("");
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<div style="text-align:center;margin:24px 0 8px;"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#064E58;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(input.ctaLabel)}</a></div>`
      : "";
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1a1f2e;">
  ${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.preheader)}</div>` : ""}
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#064E58;padding:28px 32px;color:#ffffff;">
      ${emailWhiteBrandHtml()}
      <h1 style="font-size:22px;font-weight:700;margin:22px 0 0;">${escapeHtml(input.heading)}</h1>
    </div>
    <div style="padding:28px 32px;">${paras}${cta}</div>
    <div style="padding:18px 32px;background:#0f172a;color:#cbd5e1;font-size:12px;line-height:1.6;">
      TalVault · Secure vault for talent and their managers · This email was sent to ${escapeHtml(input.recipientEmail)} because of activity on your TalVault account. If this wasn't expected, you can ignore it.
    </div>
  </div>
</body></html>`;
  const text = [
    input.heading,
    "",
    ...input.paragraphs,
    ...(input.ctaLabel && input.ctaUrl ? ["", `${input.ctaLabel}: ${input.ctaUrl}`] : []),
  ].join("\n");
  return { subject: input.subject, html, text };
}

export function fmtLongDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
