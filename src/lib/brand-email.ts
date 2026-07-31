import lockupWhite from "@/assets/talvault-lockup-white.png.asset.json";
import lockupTeal from "@/assets/talvault-lockup-teal.png.asset.json";

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

/** Teal email header bar with the TalVault lockup. */
export function emailHeaderHtml(subtitle?: string) {
  return `<div style="background:#064E58;padding:20px 24px;">
    <img src="${EMAIL_LOGO_WHITE_URL}" alt="TalVault" width="150" style="display:block;border:0;height:auto;max-width:150px;" />
    ${subtitle ? `<div style="color:#D9F0F2;font-size:11px;letter-spacing:2px;font-weight:700;margin-top:8px;text-transform:uppercase;">${subtitle}</div>` : ""}
  </div>`;
}
