/**
 * Browser-safe helpers for turning a raw user-agent string into a short,
 * human-readable device label. Shared by the talent security log and the
 * new-device sign-in alert so both describe a device identically.
 */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
      : /Chrome\//.test(ua) ? "Chrome"
        : /Firefox\//.test(ua) ? "Firefox"
          : /Safari\//.test(ua) ? "Safari"
            : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
      : /Mac OS X/.test(ua) ? "macOS"
        : /Android/.test(ua) ? "Android"
          : /iPhone|iPad/.test(ua) ? "iOS"
            : /Linux/.test(ua) ? "Linux"
              : "Unknown OS";
  return `${browser} · ${os}`;
}

/** Stable, low-cardinality key for a device label (used for de-duplication). */
export function deviceKey(ua: string | null | undefined): string {
  return deviceLabel(ua).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
