import { emailWhiteBrandHtml } from "@/lib/brand-email";

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

export const DEFAULT_TALENT_INVITATION_SUBJECT = "{{agency_name}} has invited you to TalVault";

export const DEFAULT_TALENT_INVITATION_BODY = [
  "Hi {{talent_name}},",
  "",
  "{{agency_name}} uses TalVault to share documents with the talent they represent. You'll get your own Private Vault that only you can see, plus a shared folder with {{agency_name}}.",
  "",
  "Setting up takes about five minutes: choose a password, accept the terms, confirm your details and verify your sign-in with a code we email you. We never send passwords by email.",
].join("\n");

/** Admin → independent talent (no agency). TalVault is the sender. */
export const DEFAULT_INDEPENDENT_TALENT_INVITATION_SUBJECT =
  "You're invited to set up your TalVault";

export const DEFAULT_INDEPENDENT_TALENT_INVITATION_BODY = [
  "Welcome to TalVault, {{talent_name}}",
  "",
  "TalVault is a secure, invite-only vault where talent keep contracts, ID, tax and career documents in one protected place. You've been invited by the TalVault team.",
  "",
  "Setting up takes about five minutes: choose a password, accept the terms, confirm your details and verify your sign-in with a code we email you. We never send passwords by email.",
].join("\n");

export const DEFAULT_STAFF_INVITATION_SUBJECT = "Join {{agency_name}} on TalVault";

export const DEFAULT_STAFF_INVITATION_BODY = [
  "Hi {{contact_person}},",
  "",
  "{{agency_name}} has invited you to join their team on TalVault — the secure place where the agency manages its talent roster, shared folders and documents.",
  "",
  "Click the button below to accept your invitation and set up your account. You'll choose your own password on the next screen — we never send passwords by email.",
].join("\n");

export const DEFAULT_ADMIN_INVITATION_SUBJECT = "You've been invited to administer TalVault";

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

export type InvitationVariantKey = "agency" | "talent" | "independent" | "staff" | "admin";

export const INVITATION_VARIANTS: Record<InvitationVariantKey, InvitationVariant> = {
  agency: {
    strapline: "Secure document vault for talent agencies and their people.",
    ctaLabel: "Accept invitation",
    expiryHelp: "If the link expires, contact your TalVault administrator for a fresh invite.",
    footerBrand: "TalVault",
  },
  talent: {
    strapline: "Your private vault for personal and professional documents.",
    ctaLabel: "Set up my TalVault",
    expiryHelp: "If the link expires, contact your Manager for a fresh invite.",
    footerBrand: "TalVault",
  },
  independent: {
    strapline: "A private, invite-only vault for your important documents.",
    ctaLabel: "Set up my TalVault",
    expiryHelp: "If the link expires, contact the TalVault team for a fresh invite.",
    footerBrand: "TalVault",
  },
  staff: {
    strapline: "Secure document vault for talent agencies and their people.",
    ctaLabel: "Accept invitation",
    expiryHelp: "If the link expires, ask your agency owner for a fresh invite.",
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
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
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
  /** When set, rendered as its own (editable) paragraph before `body`. */
  greeting?: string;
  agencyName?: string | null;
  contactPerson?: string | null;
  talentName?: string | null;
  permissionLevel?: string | null;
  recipientEmail: string;
  inviteUrl: string;
  expiryDate: string;
  /** Defaults to the agency variant so existing callers are unchanged. */
  variant?: InvitationVariantKey;
  /**
   * Preview only: marks the subject heading, greeting and message as
   * click-to-edit. Everything else (button, link, expiry, security wording,
   * footer) is never editable. Never set when sending.
   */
  editable?: boolean;
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
  const greeting = input.greeting?.trim() ?? "";

  const editAttr = input.editable
    ? ` contenteditable="true" spellcheck="true" style="outline:1px dashed #8FB3B8;outline-offset:4px;border-radius:4px;cursor:text;`
    : ` style="`;
  const pStyle = "font-size:15px;line-height:1.55;margin:0 0 14px;";
  const paras = bodyParagraphs(resolvedBody)
    .map((p) => `<p style="${pStyle}">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const greetingHtml = greeting
    ? `<p data-tv-field="greeting"${editAttr}${pStyle}">${escapeHtml(greeting)}</p>`
    : "";
  const messageHtml = input.editable
    ? `<div data-tv-field="message"${editAttr}margin:0 0 14px;">${paras}</div>`
    : paras;
  const headingStyle = "font-size:22px;font-weight:700;margin:22px 0 6px;";
  const headingAttr = input.editable ? ` data-tv-field="subject-heading" style="` : ` style="`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1a1f2e;">
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <div style="background:#064E58;padding:28px 32px;color:#ffffff;">
      ${emailWhiteBrandHtml()}
      <h1${headingAttr}${headingStyle}">${escapeHtml(subject)}</h1>
      <p style="font-size:14px;opacity:0.95;margin:0;">${escapeHtml(v.strapline)}</p>
    </div>
    <div style="padding:28px 32px;">
      ${greetingHtml}${messageHtml}
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
    ...(greeting ? [greeting, ""] : []),
    ...bodyParagraphs(resolvedBody).flatMap((p, i) => (i ? ["", p] : [p])),
    "",
    `${v.ctaLabel}:`,
    input.inviteUrl,
    "",
    `Expires: ${input.expiryDate}`,
    v.expiryHelp,
    "",
    INVITATION_DISCLAIMER,
    "",
    `${v.footerBrand} · Sent to ${input.recipientEmail}`,
  ].join("\n");

  return { subject, html, text };
}

/* -------------------------------------------------------------------------- */
/*  Admin invitations (agency + independent talent): per-invitation wording   */
/* -------------------------------------------------------------------------- */

export type AdminInviteKind = "agency" | "talent";

/** Real values from the invitation; nothing here may ever be a placeholder. */
export type AdminInviteMerge = {
  agencyName?: string | null;
  contactPerson?: string | null;
  talentName?: string | null;
  adminName?: string | null;
  recipientEmail?: string | null;
  expiryDate?: string | null;
  inviteUrl?: string | null;
};

export type AdminInviteWording = { subject: string; greeting: string; message: string };

export type MergeIssue = { field: string; message: string; fix: "details" | "account" };

const firstName = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";
const has = (s?: string | null) => !!s && s.trim().length > 0;

/** Values the email cannot be sent without, with where to fix each. */
export function missingMergeFields(kind: AdminInviteKind, m: AdminInviteMerge): MergeIssue[] {
  const out: MergeIssue[] = [];
  if (kind === "agency" && !has(m.agencyName))
    out.push({ field: "agency_name", message: "The agency name is missing.", fix: "details" });
  if (kind === "talent" && !has(m.talentName))
    out.push({ field: "talent_name", message: "The talent's name is missing.", fix: "details" });
  if (!has(m.recipientEmail))
    out.push({ field: "email", message: "The recipient's email address is missing.", fix: "details" });
  if (!has(m.expiryDate))
    out.push({ field: "expiry", message: "The expiry date is missing.", fix: "details" });
  if (!has(m.adminName))
    out.push({
      field: "admin_name",
      message: "Your name is missing from your profile, so the email can't say who invited them.",
      fix: "account",
    });
  if (!has(m.inviteUrl))
    out.push({ field: "invite_url", message: "The invitation link isn't ready yet. Save the draft first.", fix: "details" });
  return out;
}

/** The standard wording for this invitation, filled with its real values. */
export function standardInviteWording(kind: AdminInviteKind, m: AdminInviteMerge): AdminInviteWording {
  const admin = (m.adminName ?? "").trim();
  if (kind === "agency") {
    const agency = (m.agencyName ?? "").trim();
    return {
      subject: `${agency} is invited to join TalVault`,
      greeting: has(m.contactPerson) ? `Hi ${firstName(m.contactPerson)},` : `Hello ${agency} team,`,
      message: [
        `${admin} from the TalVault team has invited ${agency} to onboard onto the TalVault platform.`,
        "Click the button below to accept your invitation and finish setting up your agency account. You'll create your own password on the next screen — we never send passwords by email.",
      ].join("\n\n"),
    };
  }
  return {
    subject: "You're invited to set up your TalVault",
    greeting: `Hi ${firstName(m.talentName)},`,
    message: [
      `TalVault is a secure, invite-only vault where talent keep contracts, ID, tax and career documents in one protected place. You've been invited by ${admin} from the TalVault team.`,
      "Setting up takes about five minutes: choose a password, accept the terms, confirm your details and verify your sign-in with a code we email you. We never send passwords by email.",
    ].join("\n\n"),
  };
}

/** Anything that looks like an unfilled merge field. */
const PLACEHOLDER_RE = /\{\{|\}\}|<[^>\n]{1,40}>|\[[A-Za-z _]{2,30}\]/;

export const WORDING_LIMITS = { subject: 200, greeting: 120, message: 4000 } as const;

/** Problems with edited wording; empty when it can be sent. */
export function wordingIssues(w: AdminInviteWording): string[] {
  const out: string[] = [];
  (["subject", "greeting", "message"] as const).forEach((k) => {
    const label = k === "subject" ? "Subject" : k === "greeting" ? "Greeting" : "Message";
    const v = w[k].trim();
    if (!v) out.push(`${label} can't be empty.`);
    else if (v.length > WORDING_LIMITS[k]) out.push(`${label} is too long.`);
    else if (PLACEHOLDER_RE.test(v)) out.push(`${label} still contains a placeholder — replace it with the real wording.`);
  });
  return out;
}

/** The one renderer for admin invitations: preview, send, resend all use it. */
export function renderAdminInvite(
  kind: AdminInviteKind,
  m: AdminInviteMerge,
  w: AdminInviteWording,
  opts: { editable?: boolean } = {},
) {
  return buildInvitationEmail({
    variant: kind === "agency" ? "agency" : "independent",
    subject: escapeTokens(w.subject.trim()),
    greeting: w.greeting.trim(),
    body: escapeTokens(w.message.trim()),
    recipientEmail: m.recipientEmail ?? "",
    inviteUrl: m.inviteUrl ?? "",
    expiryDate: m.expiryDate ?? "",
    editable: opts.editable,
  });
}

/** Approved text is literal: never let it be re-interpreted as tokens. */
function escapeTokens(s: string) {
  return s.replace(/\{\{/g, "{ {");
}
