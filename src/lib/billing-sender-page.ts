export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
export function billingSenderPage(title: string, body: string, status = 200, token?: string): Response {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · TalVault</title></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${token ? `<form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Confirm this address</button></form>` : ""}</main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" },
  });
}