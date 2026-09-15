import { emailHeaderHtml, PUBLIC_SITE_URL } from "@/lib/brand-email";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Composes the reminder email for a single talent notification (document
 * expiry, share expiry, new-device sign-in). Deliberately contains no document
 * contents — only the headline, the context line and a link back to TalVault.
 */
export function buildReminderEmail(input: {
  title: string;
  detail?: string | null;
  ctaPath?: string;
}) {
  const link = `${PUBLIC_SITE_URL}${input.ctaPath ?? "/talent"}`;
  const subject = `TalVault reminder: ${input.title}`;

  const text = [
    input.title,
    input.detail ?? "",
    "",
    "Open TalVault:",
    link,
    "",
    "You can change how early you are reminded in Settings → Notifications.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F5F5F1;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1F2933;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    ${emailHeaderHtml("Reminder")}
    <div style="padding:24px;">
      <p style="margin:0 0 10px;font-size:16px;font-weight:700;">${escapeHtml(input.title)}</p>
      ${input.detail ? `<p style="margin:0 0 18px;line-height:1.55;color:#4B5563;">${escapeHtml(input.detail)}</p>` : ""}
      <p style="margin:0 0 22px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#064E58;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Open TalVault</a>
      </p>
      <p style="margin:0;font-size:12px;color:#65707A;">
        You can change how early you are reminded in Settings → Notifications.
      </p>
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}
