/**
 * Composes the Loved-One share notification email.
 *
 * SECURITY INVARIANT: the access code must NEVER appear in this email.
 * The recipient gets the link here; the talent passes the code out-of-band.
 */
export function buildShareEmail(input: {
  lovedOneName: string;
  sharerName: string;
  link: string;
  expiresAt: string;
  itemLabel: string;
  note?: string | null;
}) {
  const subject = `${input.sharerName} has shared ${input.itemLabel} with you`;
  const expires = new Date(input.expiresAt).toLocaleString();

  const text = [
    `Hi ${input.lovedOneName},`,
    ``,
    `${input.sharerName} has shared ${input.itemLabel} with you securely via TalVault.`,
    ``,
    `Open your secure link:`,
    input.link,
    ``,
    `IMPORTANT: this link on its own will not open the documents. You also need a`,
    `one-time access code. For your security that code is NOT in this email —`,
    `${input.sharerName} will give it to you directly (by phone or message).`,
    ``,
    input.note ? `Their note: ${input.note}` : ``,
    `Access ends ${expires}. The sharer can revoke it at any time.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F5F5F1;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1F2933;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    <div style="background:#064E58;padding:18px 24px;color:#fff;font-weight:700;">TalVault</div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;">Hi ${escapeHtml(input.lovedOneName)},</p>
      <p style="margin:0 0 18px;line-height:1.55;">
        <strong>${escapeHtml(input.sharerName)}</strong> has shared ${escapeHtml(input.itemLabel)} with you securely via TalVault.
      </p>
      <p style="margin:0 0 22px;">
        <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#064E58;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Open secure link</a>
      </p>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;font-size:14px;line-height:1.55;">
        <strong>You'll need an access code.</strong><br/>
        This link on its own will not open the documents. For your security the code is
        <strong>not included in this email</strong> — ${escapeHtml(input.sharerName)} will give it to you
        directly by phone or message.
      </div>
      ${
        input.note
          ? `<div style="margin-top:16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px;font-size:14px;">${escapeHtml(input.note)}</div>`
          : ""
      }
      <p style="margin:20px 0 0;font-size:12px;color:#65707A;">
        Access ends ${escapeHtml(expires)}. The sharer can revoke it at any time.
      </p>
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Sends via Resend when a sender domain + key are configured.
 * Returns { sent:false, reason } when email infrastructure isn't set up yet,
 * so the caller can fall back to "copy the link and send it yourself".
 */
export async function sendShareEmail(to: string, mail: { subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false as const, reason: "email_not_configured" as const };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Loved-One share email failed [${res.status}]: ${body}`);
    return { sent: false as const, reason: "send_failed" as const, detail: body };
  }
  return { sent: true as const };
}
