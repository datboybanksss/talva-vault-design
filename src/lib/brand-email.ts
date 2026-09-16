import iconWhite from "@/assets/talvault-icon-white.png.asset.json";
import lockupWhite from "@/assets/talvault-lockup-white.png.asset.json";
import lockupTeal from "@/assets/talvault-lockup-teal.png.asset.json";
import wordWhite from "@/assets/talvault-word-white.png.asset.json";

/**
 * Absolute base URL used in outbound email HTML (email clients cannot resolve
 * relative asset paths). Falls back to the stable project URL.
 */
export const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL ??
  "https://project--f47b509e-a49f-44ed-abf5-85631a6dc162.lovable.app"
).replace(/\/$/, "");

export const EMAIL_LOGO_WHITE_URL = `${PUBLIC_SITE_URL}${lockupWhite.url}`;
export const EMAIL_LOGO_TEAL_URL = `${PUBLIC_SITE_URL}${lockupTeal.url}`;
export const EMAIL_ICON_WHITE_URL = `${PUBLIC_SITE_URL}${iconWhite.url}`;
export const EMAIL_WORDMARK_WHITE_URL = `${PUBLIC_SITE_URL}${wordWhite.url}`;

/**
 * Email-safe version of the app's white icon-and-wordmark treatment. Keeping
 * the two source images separate avoids softening the icon when a wide lockup
 * is reduced by mail clients. Explicit opacity protects against inherited
 * client styles that otherwise make transparent PNGs look like watermarks.
 */
export function emailWhiteBrandHtml() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;opacity:1;">
    <tr>
      <td width="40" height="40" valign="middle" align="center" style="width:40px;height:40px;background:#356F77;border-radius:10px;opacity:1;">
        <img src="${EMAIL_ICON_WHITE_URL}" alt="" width="22" height="22" style="display:block;border:0;width:22px;height:22px;max-width:22px;opacity:1;" />
      </td>
      <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
      <td valign="middle" style="opacity:1;">
        <img src="${EMAIL_WORDMARK_WHITE_URL}" alt="TalVault" width="98" style="display:block;border:0;width:98px;height:auto;max-width:98px;opacity:1;" />
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
