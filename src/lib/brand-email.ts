import iconWhite from "@/assets/talvault-icon-white.png.asset.json";
import lockupWhite from "@/assets/talvault-lockup-white.png.asset.json";
import lockupTeal from "@/assets/talvault-lockup-teal.png.asset.json";
import wordWhite from "@/assets/talvault-word-white.png.asset.json";

/** Shown when the public website address isn't configured, so no full link can be made. */
export const SITE_LINK_MISSING_MESSAGE =
  "We couldn't create a full link because the TalVault website address hasn't been set up yet. Please ask a TalVault administrator to add it, then try again.";

/**
 * The validated public origin from PUBLIC_SITE_URL (absolute https, no path,
 * query, hash or credentials), or null. Read on every call, never at module
 * load, so a newly added setting takes effect without code changes.
 */
export function publicSiteUrl(): string | null {
  const configured = process.env.PUBLIC_SITE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      configured.replace(/\/$/, "") !== url.origin
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The validated origin, or a plain-language error. Never returns "". */
export function requirePublicSiteUrl(message: string = SITE_LINK_MISSING_MESSAGE): string {
  const origin = publicSiteUrl();
  if (!origin) {
    console.error("[site-link] PUBLIC_SITE_URL is missing or invalid; refusing to build a link.");
    throw new Error(message);
  }
  return origin;
}

/** Absolute link to an app path, e.g. "/invite/talent/abc". Throws if unconfigured. */
export function requireSiteLink(path: string, message?: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${requirePublicSiteUrl(message)}${clean}`;
}

/** Absolute link, or null when the website address isn't configured. */
export function siteLinkOrNull(path: string): string | null {
  const origin = publicSiteUrl();
  return origin ? `${origin}${path.startsWith("/") ? path : `/${path}`}` : null;
}

export type InviteLinkKind = "agency" | "talent" | "admin";

/** The one place invitation links are built. */
export function invitePath(kind: InviteLinkKind, token: string): string {
  const t = encodeURIComponent(token);
  return kind === "agency"
    ? `/invite/${t}`
    : kind === "talent"
      ? `/invite/talent/${t}`
      : `/invite/admin/${t}`;
}

export function requireInviteLink(kind: InviteLinkKind, token: string): string {
  return requireSiteLink(invitePath(kind, token));
}

/** Email images must be absolute; without a configured origin they are left out. */
function emailAsset(path: string): string | null {
  return siteLinkOrNull(path);
}
export const emailLogoWhiteUrl = () => emailAsset(lockupWhite.url);
export const emailLogoTealUrl = () => emailAsset(lockupTeal.url);

/**
 * Email-safe version of the app's white icon-and-wordmark treatment. Keeping
 * the two source images separate avoids softening the icon when a wide lockup
 * is reduced by mail clients. Explicit opacity protects against inherited
 * client styles that otherwise make transparent PNGs look like watermarks.
 */
export function emailWhiteBrandHtml() {
  const icon = emailAsset(iconWhite.url);
  const word = emailAsset(wordWhite.url);
  if (!icon || !word) {
    return `<div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">TalVault</div>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;opacity:1;">
    <tr>
      <td width="40" height="40" valign="middle" align="center" style="width:40px;height:40px;background:#356F77;border-radius:10px;opacity:1;">
        <img src="${icon}" alt="" width="22" height="22" style="display:block;border:0;width:22px;height:22px;max-width:22px;opacity:1;" />
      </td>
      <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
      <td valign="middle" style="opacity:1;">
        <img src="${word}" alt="TalVault" width="98" style="display:block;border:0;width:98px;height:auto;max-width:98px;opacity:1;" />
      </td>
    </tr>
  </table>`;
}

/** Teal email header bar with the TalVault lockup. */
export function emailHeaderHtml(subtitle?: string) {
  return `<div style="background:#064E58;padding:20px 24px;">
    ${emailWhiteBrandHtml()}
    ${subtitle ? `<div style="color:#D9F0F2;font-size:11px;letter-spacing:2px;font-weight:700;margin-top:8px;text-transform:uppercase;">${subtitle}</div>` : ""}
  </div>`;
}
