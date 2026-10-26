import globalStyles from "@/styles.css?raw";

// Share the actual app tokens without loading external styles, fonts or scripts.
const lightTokens = /^:root\s*\{([\s\S]*?)^\}/m.exec(globalStyles)?.[1] ?? "";
const darkTokens = /^:root\[data-theme="dark"\]\s*\{([\s\S]*?)^\}/m.exec(globalStyles)?.[1] ?? "";
const pageStyles = `
:root { ${lightTokens} color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { ${darkTokens} } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-sans); font-size: 16px; line-height: 1.6; }
header { background: var(--primary); color: var(--primary-foreground); padding: 28px max(24px, calc((100% - 720px) / 2)); }
.brand { font-size: 26px; font-weight: 700; }
main { width: min(100% - 48px, 720px); margin: 48px auto; }
h1 { font-size: 28px; line-height: 1.25; margin: 0 0 20px; overflow-wrap: anywhere; }
p { margin: 0; max-width: 65ch; overflow-wrap: anywhere; }
form { margin-top: 28px; }
button { border: 1px solid var(--primary); border-radius: var(--radius-sm); padding: 12px 20px; background: var(--primary); color: var(--primary-foreground); font: inherit; font-weight: 600; min-height: 48px; cursor: pointer; max-width: 100%; }
button:focus-visible { outline: 3px solid var(--foreground); outline-offset: 4px; }
footer { border-top: 1px solid var(--border); margin-top: 40px; padding-top: 20px; color: var(--text-body); font-size: 14px; }
@media (max-width: 480px) { main { margin: 32px auto; } h1 { font-size: 24px; } button { width: 100%; } }
`;

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
export function billingSenderPage(
  title: string,
  body: string,
  status = 200,
  token?: string,
): Response {
  return new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · TalVault</title><meta name="description" content="Confirm the reply address for agency quotes and invoices in TalVault."><meta property="og:title" content="${escapeHtml(title)} · TalVault"><meta property="og:description" content="Confirm the reply address for agency quotes and invoices in TalVault."><meta property="og:type" content="website"><meta name="twitter:card" content="summary"><style>${pageStyles}</style></head><body><header><div class="brand">TalVault</div></header><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${token ? `<form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Confirm this address</button></form>` : ""}<footer>Quotes &amp; invoices</footer></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
