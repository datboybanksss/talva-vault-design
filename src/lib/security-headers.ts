/**
 * Security header baseline (TVA-SEC-005).
 *
 * Applied to every response leaving the Worker in `src/server.ts`, so it covers
 * SSR documents, server functions and `/api/*` routes alike. A `public/_headers`
 * file mirrors the static-asset case for the CDN edge.
 *
 * CSP notes — why `'unsafe-inline'` is present for scripts and styles:
 *   - TanStack Start's SSR shell emits inline hydration/serialisation scripts,
 *     plus our own pre-paint theme script in `__root.tsx`.
 *   - Tailwind/Radix inject inline `style` attributes at runtime.
 *   Nonce plumbing through the Start shell is not supported today; when it is,
 *   swap `'unsafe-inline'` for a per-request nonce. Everything else is locked
 *   down: no `object-src`, no framing, no cross-origin form posts.
 */

const SUPABASE_URL = (process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "").replace(
  /\/$/,
  "",
);

function buildCsp(isDev: boolean): string {
  const supabaseHttp = SUPABASE_URL || "https://*.supabase.co";
  const supabaseWs = supabaseHttp.replace(/^http/, "ws");

  const connect = [
    "'self'",
    supabaseHttp,
    supabaseWs,
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ];
  if (isDev) connect.push("ws://localhost:*", "http://localhost:*");

  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connect.join(" ")}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function applySecurityHeaders(response: Response, isDev = false): Response {
  const headers = new Headers(response.headers);

  if (!headers.has("content-security-policy")) {
    headers.set("content-security-policy", buildCsp(isDev));
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set(
    "permissions-policy",
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), interest-cohort=()",
  );
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("x-permitted-cross-domain-policies", "none");
  if (!isDev) {
    headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
