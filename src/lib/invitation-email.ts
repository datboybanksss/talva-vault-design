import { EMAIL_LOGO_WHITE_URL } from "@/lib/brand-email";

/**
 * Shown wherever an invitation email could not be delivered because the
 * sending domain / key isn't configured yet. Kept in one place so the
 * agency, talent, administrator and loved-one flows all say the same thing.
 */
export const EMAIL_FALLBACK_NOTICE =
  "Email sending isn't available yet — domain verification pending. Copy the link and send it yourself for now.";

/* -------------------------------------------------------------------------- */
/*  Per-flow templates                                                        */
/* -------------------------------------------------------------------------- */

export const DEFAULT_INVITATION_SUBJECT = "You're invited to join TalVault";

/** Default editable body. Tokens are substituted at render time. */
export const DEFAULT_INVITATION_BODY = [
  "Hi {{contact_person}},",
  "",
  "A TalVault administrator has invited {{agency_name}} to onboard onto the TalVault platform.",
  "",
  "Click the button below to accept your invitation and finish setting up your agency account. You'll create your own password on the next screen — we never send passwords by email.",
].join("\n");

export const DEFAULT_TALENT_INVITATION_SUBJECT = "Your TalVault is ready to set up";

export const DEFAULT_TALENT_INVITATION_BODY = [
  "Hi {{talent_name}},",
  "",
  "{{agency_name}} has invited you to set up your Talent Vault on TalVault — a private space for your own documents, plus a shared folder your Manager can see.",
  "",
  "Click the button below to accept your invitation and create your account. You'll choose your own password on the next screen — we never send passwords by email.",
].join("\n");

export const DEFAULT_ADMIN_INVITATION_SUBJECT =
  "You've been invited to administer TalVault";

export const DEFAULT_ADMIN_INVITATION_BODY = [
  "Hi,",
  "",
  "You've been invited to join TalVault as an administrator with {{permission_level}} access.",
  "",
  "Click the button below to accept your invitation and set up your administrator account. You'll create your own password on the next screen — we never send passwords by email.",
].join("\n");

/** The fixed (non-editable) chrome that wraps each flow's body. */
export type InvitationVariant = {
  strapline: string;
  ctaLabel: string;
  expiryHelp: string;
  footerBrand: string;
};

export const INVITATION_VARIANTS: Record<"agency" | "talent" | "admin", InvitationVariant> = {
  agency: {
    strapline: "Secure document vault for talent agencies and their people.",
    ctaLabel: "Accept invitation",
    expiryHelp: "If the link expires, contact your TalVault administrator for a fresh invite.",
    footerBrand: "TalVault",
  },
  talent: {
    strapline: "Your private vault for personal and professional documents.",
    ctaLabel: "Set up my vault",
    expiryHelp: "If the link expires, contact your Manager for a fresh invite.",
    footerBrand: "TalVault",
  },
  admin: {
    strapline: "Internal administration for the TalVault platform.",
    ctaLabel: "Accept invitation",
    expiryHelp: "If the link expires, contact the Main Administrator for a fresh invite.",
    footerBrand: "TalVault Admin",
  },
};

export const INVITATION_DISCLAIMER =
  "If you weren't expecting this email, you can safely ignore it — no account will be created without you accepting.";

export const INVITATION_FALLBACK_LINK_COPY = "or paste this link into your browser:";

/** Human labels for the administrator permission enum. */
export function permissionLabel(level?: string | null) {
  return level === "view_only" ? "view-only" : level === "edit" ? "edit" : "";
}

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                 */
/* -------------------------------------------------------------------------- */

export type InvitationTokens = {
  contact_person?: string | null;
  talent_name?: string | null;
  agency_name?: string | null;
  permission_level?: string | null;
  email?: string | null;
  expiry_date?: string;
  invite_url?: string;
};

export function applyTokens(body: string, vars: InvitationTokens) {
  return body
    .replace(/\{\{\s*contact_person\s*\}\}/g, vars.contact_person || "there")
    .replace(/\{\{\s*talent_name\s*\}\}/g, vars.talent_name || "there")
    .replace(/\{\{\s*agency_name\s*\}\}/g, vars.agency_name || "your agency")
    .replace(/\{\{\s*permission_level\s*\}\}/g, permissionLabel(vars.permission_level))
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
  agencyName?: string | null;
  contactPerson?: string | null;
  talentName?: string | null;
  permissionLevel?: string | null;
  recipientEmail: string;
  inviteUrl: string;
  expiryDate: string;
  /** Defaults to the agency variant so existing callers are unchanged. */
  variant?: "agency" | "talent" | "admin";
}) {
  const v = INVITATION_VARIANTS[input.variant ?? "agency"];
  const tokens: InvitationTokens = {
    contact_person: input.contactPerson,
    talent_name: input.talentName,
    agency_name: input.agencyName,
    permission_level: input.permissionLevel,
    email: input.recipientEmail,
    expiry_date: input.expiryDate,
    invite_url: input.inviteUrl,
  };

  const resolvedBody = applyTokens(input.body, tokens);
  const subject = applyTokens(input.subject, { ...tokens, invite_url: undefined });

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
      <p style="font-size:14px;opacity:0.95;margin:0;">${escapeHtml(v.strapline)}</p>
    </div>
    <div style="padding:28px 32px;">
      ${paras}
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#064E58;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(v.ctaLabel)}</a>
      </div>
      <p style="font-size:13px;color:#5b6478;text-align:center;margin:10px 0 0;">
        ${escapeHtml(INVITATION_FALLBACK_LINK_COPY)}<br />
        <span style="word-break:break-all;color:#064E58;">${escapeHtml(input.inviteUrl)}</span>
      </p>
      <div style="margin-top:26px;padding:14px 16px;background:#f7f8fb;border-radius:8px;border-left:3px solid #064E58;">
        <div style="font-size:12px;color:#5b6478;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;">Expires</div>
        <div style="font-size:15px;font-weight:600;">${escapeHtml(input.expiryDate)}</div>
        <div style="font-size:12px;color:#5b6478;margin-top:6px;">${escapeHtml(v.expiryHelp)}</div>
      </div>
      <p style="font-size:13px;color:#5b6478;line-height:1.55;margin:24px 0 0;">
        ${escapeHtml(INVITATION_DISCLAIMER)}
      </p>
    </div>
    <div style="padding:18px 32px;background:#0f172a;color:#cbd5e1;font-size:12px;line-height:1.6;">
      ${escapeHtml(v.footerBrand)} · Sent to ${escapeHtml(input.recipientEmail)}
    </div>
  </div>
</body></html>`;

  const text = [
    ...bodyParagraphs(resolvedBody),
    "",
    `${v.ctaLabel}:`,
    input.inviteUrl,
    "",
    `Expires: ${input.expiryDate}`,
    v.expiryHelp,
  ].join("\n");

  return { subject, html, text };
}
