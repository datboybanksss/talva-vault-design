import { sendLovableEmail } from "@lovable.dev/email-js";
import { EMAIL_LOGO_WHITE_URL } from "@/lib/brand-email";

export const DEFAULT_INVITATION_SUBJECT = "You're invited to join TalVault";

/** Default editable body. Tokens are substituted at render time. */
export const DEFAULT_INVITATION_BODY = [
  "Hi {{contact_person}},",
  "",
  "A TalVault administrator has invited {{agency_name}} to onboard onto the TalVault platform.",
  "",
  "Click the button below to accept your invitation and finish setting up your agency account. You'll create your own password on the next screen — we never send passwords by email.",
].join("\n");

export function applyTokens(
  body: string,
  vars: { contact_person?: string | null; agency_name?: string | null; email?: string | null; expiry_date?: string; invite_url?: string },
) {
  return body
    .replace(/\{\{\s*contact_person\s*\}\}/g, vars.contact_person || "there")
    .replace(/\{\{\s*agency_name\s*\}\}/g, vars.agency_name || "your agency")
    .replace(/\{\{\s*email\s*\}\}/g, vars.email || "")
    .replace(/\{\{\s*expiry_date\s*\}\}/g, vars.expiry_date || "")
    .replace(/\{\{\s*invite_url\s*\}\}/g, vars.invite_url || "");
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Splits the plain-text body into paragraphs for HTML rendering. */
export function bodyParagraphs(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function buildInvitationEmail(input: {
  subject: string;
  body: string;
  agencyName: string;
  contactPerson?: string | null;
  recipientEmail: string;
  inviteUrl: string;
  expiryDate: string;
}) {
  const resolvedBody = applyTokens(input.body, {
    contact_person: input.contactPerson,
    agency_name: input.agencyName,
    email: input.recipientEmail,
    expiry_date: input.expiryDate,
    invite_url: input.inviteUrl,
  });
  const subject = applyTokens(input.subject, {
    contact_person: input.contactPerson,
    agency_name: input.agencyName,
    email: input.recipientEmail,
    expiry_date: input.expiryDate,
  });

  const paras = bodyParagraphs(resolvedBody)
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.55;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1a1f2e;">
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <div style="background:#064E58;padding:28px 32px;color:#ffffff;">
      <img src="${EMAIL_LOGO_WHITE_URL}" alt="TalVault" width="150" style="display:block;border:0;height:auto;max-width:150px;" />
      <h1 style="font-size:22px;font-weight:700;margin:22px 0 6px;">${escapeHtml(subject)}</h1>
      <p style="font-size:14px;opacity:0.95;margin:0;">Secure document vault for talent agencies and their people.</p>
    </div>
    <div style="padding:28px 32px;">
      ${paras}
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#064E58;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;">Accept invitation</a>
      </div>
      <p style="font-size:13px;color:#5b6478;text-align:center;margin:10px 0 0;">
        or paste this link into your browser:<br />
        <span style="word-break:break-all;color:#064E58;">${escapeHtml(input.inviteUrl)}</span>
      </p>
      <div style="margin-top:26px;padding:14px 16px;background:#f7f8fb;border-radius:8px;border-left:3px solid #064E58;">
        <div style="font-size:12px;color:#5b6478;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;">Expires</div>
        <div style="font-size:15px;font-weight:600;">${escapeHtml(input.expiryDate)}</div>
        <div style="font-size:12px;color:#5b6478;margin-top:6px;">If the link expires, contact your TalVault administrator for a fresh invite.</div>
      </div>
      <p style="font-size:13px;color:#5b6478;line-height:1.55;margin:24px 0 0;">
        If you weren't expecting this email, you can safely ignore it — no account will be created without you accepting.
      </p>
    </div>
    <div style="padding:18px 32px;background:#0f172a;color:#cbd5e1;font-size:12px;line-height:1.6;">
      TalVault · Sent to ${escapeHtml(input.recipientEmail)}
    </div>
  </div>
</body></html>`;

  const text = [
    ...bodyParagraphs(resolvedBody),
    "",
    "Accept your invitation:",
    input.inviteUrl,
    "",
    `Expires: ${input.expiryDate}`,
  ].join("\n");

  return { subject, html, text };
}

type SendResult =
  | { sent: true; message_id?: string }
  | { sent: false; reason: "email_not_configured" | "domain_unverified" | "send_failed"; detail?: string };

/**
 * Real send through the Lovable Emails integration. Returns a structured
 * failure (instead of throwing) so the UI can surface an honest message while
 * the sender domain is still pending verification.
 */
export async function sendInvitationEmail(
  to: string,
  mail: { subject: string; html: string; text: string },
): Promise<SendResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { sent: false, reason: "email_not_configured" };

  const from = process.env["EMAIL_FROM"] ?? "TalVault <invitations@notify.talvault.com>";
  const senderDomain = (from.match(/@([^>\s]+)/)?.[1] ?? "notify.talvault.com").trim();

  try {
    const res = await sendLovableEmail(
      {
        to,
        from,
        sender_domain: senderDomain,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        label: "agency_invitation",
        purpose: "transactional",
      },
      { apiKey },
    );
    if (!res.success) return { sent: false, reason: "send_failed", detail: res.status };
    return { sent: true, message_id: res.message_id };
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : undefined;
    const detail = String(e?.message ?? e);
    const domainIssue =
      status === 403 ||
      /domain|verif|not allowed|sender/i.test(detail);
    return {
      sent: false,
      reason: domainIssue ? "domain_unverified" : "send_failed",
      detail,
    };
  }
}
