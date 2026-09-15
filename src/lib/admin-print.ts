// Printable HTML documents for the Admin portal, sharing the same visual
// language as the Agency financial report. Print-based only — no PDF library.

import { PRINT_DOC_STYLES, escapeHtml as esc } from "./billing-reports";

const zar = (cents: number) =>
  `R ${(Number(cents ?? 0) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dayMonthYear = (value: string | number | Date) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function card(value: string, label: string) {
  return `<div class="card"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
}

/** Admin Reporting — the metrics snapshot currently shown on screen. */
export function buildAdminReportingHtml(d: any) {
  const pct = (n: number, dn: number) => (dn > 0 ? `${Math.round((n / dn) * 100)}%` : "0%");
  const window = (w: any) => (w?.mature ? `${Math.round((w.active / w.mature) * 100)}% (${w.active} of ${w.mature})` : "Not yet due");

  const metricRows = (rows: [string, string, string][]) => `<table>
    <thead><tr><th>Metric</th><th>Value</th><th>Context</th></tr></thead>
    <tbody>${rows.map(([m, v, c]) => `<tr><td>${esc(m)}</td><td>${esc(v)}</td><td>${esc(c)}</td></tr>`).join("")}</tbody>
  </table>`;

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>TalVault Platform Report — ${esc(d.period.from)} to ${esc(d.period.to)}</title>
<style>${PRINT_DOC_STYLES}</style></head><body>
<h1>TalVault Platform Report</h1>
<div class="meta">Period: ${esc(dayMonthYear(d.period.from))} – ${esc(dayMonthYear(d.period.to))} · Prior period: ${esc(dayMonthYear(d.prior.from))} – ${esc(dayMonthYear(d.prior.to))} · Generated ${esc(new Date(d.generatedAt).toLocaleString("en-ZA"))}</div>

<h2>North star</h2>
<div class="cards">
  ${card(`${d.northStar.pct}%`, `Two-sided engagement · ${d.northStar.active} of ${d.northStar.total} live agency–talent relationships`)}
  ${card(`${d.northStar.priorPct}%`, "Prior period")}
  ${card(String(d.northStar.talentOnlyCount ?? 0), "Talent side only")}
  ${card(String(d.northStar.agencyOnlyCount ?? 0), "Agency side only")}
</div>

<h2>Growth &amp; funnel</h2>
${metricRows([
  ["Agencies added", String(d.growth.agenciesAdded), `${d.growth.agenciesAddedPrior} in prior period`],
  ["Invite-to-acceptance rate", `${d.growth.acceptanceRate}%`, `${d.growth.invitesAccepted} of ${d.growth.invitesSent} invitations sent in period`],
  ["Median time to accept", d.growth.medianDaysToAccept == null ? "No acceptances" : `${d.growth.medianDaysToAccept} days`, `${d.growth.acceptedInPeriod} accepted in period`],
])}

<h2>Engagement &amp; activity</h2>
${metricRows([
  ["Talent active in period", `${d.engagement.activeTalent} / ${d.engagement.totalTalent}`, `${pct(d.engagement.activeTalent, d.engagement.totalTalent)} of onboarded talent`],
  ["Agencies with an active talent share", String(d.engagement.agenciesWithShare), `${d.engagement.sharesCreated} share(s) created in period`],
  ["Documents uploaded", String(d.engagement.documentsUploaded), `${d.engagement.sharedDocuments} shared with agencies, ${d.engagement.privateDocuments} in private vaults`],
])}

<h2>Financials</h2>
<div class="cards">
  ${card(String(d.financials.quotesCount), `Quotes generated · ${zar(d.financials.quotesValueCents)}`)}
  ${card(String(d.financials.invoicesCount), `Invoices generated · ${zar(d.financials.invoicesValueCents)}`)}
  ${card(zar(d.financials.receivedCents), `Amount received · ${d.financials.paymentsCount} payment(s), including partial payments`)}
  ${card(zar(d.financials.outstandingCents), "Outstanding · invoiced in period, not yet received")}
</div>

<h2>Cohort retention</h2>
${d.cohorts.length === 0
  ? `<p class="empty">No talent onboarded up to the end of this period yet.</p>`
  : `<table>
  <thead><tr><th>Onboarding month</th><th class="n">Talent onboarded</th><th class="n">Active at 30 days</th><th class="n">Active at 60 days</th><th class="n">Active at 90 days</th></tr></thead>
  <tbody>${d.cohorts.map((c: any) => `<tr>
    <td>${esc(new Date(`${c.month}-01T00:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }))}</td>
    <td class="n">${c.size}</td>
    <td class="n">${esc(window(c.d30))}</td>
    <td class="n">${esc(window(c.d60))}</td>
    <td class="n">${esc(window(c.d90))}</td>
  </tr>`).join("")}</tbody>
</table>`}
</body></html>`;
}

export type AdminBillingPrintRow = {
  agency_name: string;
  kind: string;
  number: string;
  client_name: string | null;
  issued_at: string;
  currency: string;
  total_cents: number;
  status: string;
};

/** Admin Quotes & Invoices — the currently filtered table. */
export function buildAdminBillingHtml(
  rows: AdminBillingPrintRow[],
  kpis: { total: number; outstanding: number; paid30: number; overdueAmt: number; overdueCount: number },
  filterLabel: string,
  statusLabel: Record<string, string>,
) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>TalVault — Quotes &amp; Invoices</title>
<style>${PRINT_DOC_STYLES}</style></head><body>
<h1>TalVault — Quotes &amp; Invoices</h1>
<div class="meta">${esc(filterLabel)} · Generated ${esc(new Date().toLocaleString("en-ZA"))}</div>
<div class="cards">
  ${card(String(kpis.total), "Total records across all agencies")}
  ${card(zar(kpis.outstanding), "Outstanding · sent / overdue invoices")}
  ${card(zar(kpis.paid30), "Paid (last 30 days)")}
  ${card(zar(kpis.overdueAmt), `Overdue · ${kpis.overdueCount} record(s)`)}
</div>
<h2>Records in this view</h2>
${rows.length === 0
  ? `<p class="empty">No records match the current filters.</p>`
  : `<table>
  <thead><tr><th>Agency</th><th>Type</th><th>Number</th><th>Client</th><th>Issued</th><th class="n">Total</th><th>Status</th></tr></thead>
  <tbody>${rows.map((r) => `<tr>
    <td>${esc(r.agency_name ?? "")}</td>
    <td>${esc(r.kind === "quote" ? "Quote" : "Invoice")}</td>
    <td>${esc(r.number ?? "")}</td>
    <td>${esc(r.client_name ?? "")}</td>
    <td>${esc(dayMonthYear(r.issued_at))}</td>
    <td class="n">${esc(new Intl.NumberFormat("en-ZA", { style: "currency", currency: r.currency || "ZAR", maximumFractionDigits: 0 }).format(r.total_cents / 100))}</td>
    <td>${esc(statusLabel[r.status] ?? r.status)}</td>
  </tr>`).join("")}</tbody>
</table>`}
</body></html>`;
}
