// Financial reporting helpers for Quotes & Invoices.
// All period maths is real calendar maths against the supplied "now" — no fixed date strings.

export type BillingReportRow = {
  id: string;
  kind: "quote" | "invoice";
  number: string;
  client_name: string | null;
  talent_name: string | null;
  issued_at: string;
  due_date: string | null;
  paid_at?: string | null;
  currency: string;
  total_cents: number;
  status: string;
};

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom" | "all";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "this_year", label: "This year" },
  { key: "custom", label: "Custom range" },
  { key: "all", label: "All time" },
];

export type ResolvedPeriod = {
  key: PeriodKey;
  /** inclusive ISO date, null = unbounded */
  start: string | null;
  /** exclusive ISO date, null = unbounded */
  end: string | null;
  label: string;
};

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function fmtDayLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${MONTHS[m - 1]?.slice(0, 3)} ${y}`;
}

export function resolvePeriod(
  key: PeriodKey,
  custom: { from: string; to: string },
  now: Date = new Date(),
): ResolvedPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "this_month": {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);
      return { key, start: iso(start), end: iso(end), label: `${MONTHS[m]} ${y}` };
    }
    case "last_month": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      return { key, start: iso(start), end: iso(end), label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}` };
    }
    case "this_quarter": {
      const q = Math.floor(m / 3);
      const start = new Date(y, q * 3, 1);
      const end = new Date(y, q * 3 + 3, 1);
      return { key, start: iso(start), end: iso(end), label: `Q${q + 1} ${y}` };
    }
    case "this_year": {
      const start = new Date(y, 0, 1);
      const end = new Date(y + 1, 0, 1);
      return { key, start: iso(start), end: iso(end), label: `${y}` };
    }
    case "custom": {
      const from = custom.from || null;
      // stored "to" is inclusive for the user; convert to exclusive
      let end: string | null = null;
      if (custom.to) {
        const [yy, mm, dd] = custom.to.split("-").map(Number);
        end = iso(new Date(yy, mm - 1, dd + 1));
      }
      const label =
        from && custom.to
          ? `${fmtDayLabel(from)} – ${fmtDayLabel(custom.to)}`
          : from
            ? `From ${fmtDayLabel(from)}`
            : custom.to
              ? `Until ${fmtDayLabel(custom.to)}`
              : "Custom range";
      return { key, start: from, end, label };
    }
    case "all":
    default:
      return { key: "all", start: null, end: null, label: "All time" };
  }
}

function inPeriod(dateIso: string | null | undefined, p: ResolvedPeriod) {
  if (!dateIso) return false;
  const d = dateIso.slice(0, 10);
  if (p.start && d < p.start) return false;
  if (p.end && d >= p.end) return false;
  return true;
}

export type ReportBucket = {
  key: string;
  name: string;
  quotedCents: number;
  invoicedCents: number;
  receivedCents: number;
  outstandingCents: number;
  docCount: number;
};

export type BillingReport = {
  currency: string;
  period: ResolvedPeriod;
  quotedCents: number;
  quotedCount: number;
  invoicedCents: number;
  invoicedCount: number;
  receivedCents: number;
  receivedCount: number;
  outstandingCents: number;
  outstandingCount: number;
  overdueCount: number;
  byTalent: ReportBucket[];
  byClient: ReportBucket[];
  trend: { month: string; label: string; invoicedCents: number; receivedCents: number }[];
  lineItems: BillingReportRow[];
};

const OUTSTANDING_STATUSES = new Set(["sent", "partial", "overdue"]);

function bucket(map: Map<string, ReportBucket>, name: string) {
  const key = name.toLowerCase();
  let b = map.get(key);
  if (!b) {
    b = { key, name, quotedCents: 0, invoicedCents: 0, receivedCents: 0, outstandingCents: 0, docCount: 0 };
    map.set(key, b);
  }
  return b;
}

/**
 * Aggregates the real billing records for a period.
 * Quoted/Invoiced use issued_at; Received uses paid_at (falling back to issued_at);
 * Outstanding uses issued_at for unpaid invoices, so the by-talent / by-client
 * tables always reconcile exactly with the summary totals.
 */
export function buildBillingReport(
  rows: BillingReportRow[],
  period: ResolvedPeriod,
  now: Date = new Date(),
  trendMonths = 12,
): BillingReport {
  const report: BillingReport = {
    currency: rows[0]?.currency ?? "ZAR",
    period,
    quotedCents: 0, quotedCount: 0,
    invoicedCents: 0, invoicedCount: 0,
    receivedCents: 0, receivedCount: 0,
    outstandingCents: 0, outstandingCount: 0, overdueCount: 0,
    byTalent: [], byClient: [], trend: [], lineItems: [],
  };

  const talentMap = new Map<string, ReportBucket>();
  const clientMap = new Map<string, ReportBucket>();

  const trendMap = new Map<string, { invoicedCents: number; receivedCents: number }>();
  for (let i = trendMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendMap.set(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`, { invoicedCents: 0, receivedCents: 0 });
  }

  for (const r of rows) {
    if (r.status === "cancelled") continue;

    const paidOn = (r.paid_at ?? r.issued_at)?.slice(0, 10) ?? null;
    const isPaid = r.status === "paid";
    const isOutstanding = r.kind === "invoice" && OUTSTANDING_STATUSES.has(r.status);

    // trend is always the trailing window, independent of the selected period
    if (r.kind === "invoice") {
      const im = r.issued_at.slice(0, 7);
      const t = trendMap.get(im);
      if (t) t.invoicedCents += r.total_cents;
      if (isPaid && paidOn) {
        const pm = paidOn.slice(0, 7);
        const tp = trendMap.get(pm);
        if (tp) tp.receivedCents += r.total_cents;
      }
    }

    const issuedIn = inPeriod(r.issued_at, period);
    const paidIn = isPaid && inPeriod(paidOn, period);
    if (!issuedIn && !paidIn) continue;

    const tb = bucket(talentMap, r.talent_name?.trim() || "Unassigned");
    const cb = bucket(clientMap, r.client_name?.trim() || "No client");

    if (r.kind === "quote") {
      if (!issuedIn) continue;
      report.quotedCents += r.total_cents;
      report.quotedCount += 1;
      tb.quotedCents += r.total_cents; cb.quotedCents += r.total_cents;
      tb.docCount += 1; cb.docCount += 1;
      report.lineItems.push(r);
      continue;
    }

    if (issuedIn) {
      report.invoicedCents += r.total_cents;
      report.invoicedCount += 1;
      tb.invoicedCents += r.total_cents; cb.invoicedCents += r.total_cents;
      if (isOutstanding) {
        report.outstandingCents += r.total_cents;
        report.outstandingCount += 1;
        if (r.status === "overdue") report.overdueCount += 1;
        tb.outstandingCents += r.total_cents; cb.outstandingCents += r.total_cents;
      }
    }
    if (paidIn) {
      report.receivedCents += r.total_cents;
      report.receivedCount += 1;
      tb.receivedCents += r.total_cents; cb.receivedCents += r.total_cents;
    }
    tb.docCount += 1; cb.docCount += 1;
    report.lineItems.push(r);
  }

  const nonEmpty = (b: ReportBucket) =>
    b.quotedCents || b.invoicedCents || b.receivedCents || b.outstandingCents;
  report.byTalent = [...talentMap.values()].filter(nonEmpty);
  report.byClient = [...clientMap.values()].filter(nonEmpty);

  report.trend = [...trendMap.entries()].map(([month, v]) => {
    const [yy, mm] = month.split("-").map(Number);
    return {
      month,
      label: `${MONTHS[mm - 1]?.slice(0, 3)} ${`${yy}`.slice(2)}`,
      invoicedCents: v.invoicedCents,
      receivedCents: v.receivedCents,
    };
  });

  report.lineItems.sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  return report;
}

export type BucketSortKey = "name" | "quoted" | "invoiced" | "received" | "outstanding";

export function sortBuckets(list: ReportBucket[], key: BucketSortKey, dir: "asc" | "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    switch (key) {
      case "name": return mul * a.name.localeCompare(b.name);
      case "quoted": return mul * (a.quotedCents - b.quotedCents);
      case "invoiced": return mul * (a.invoicedCents - b.invoicedCents);
      case "received": return mul * (a.receivedCents - b.receivedCents);
      case "outstanding":
      default: return mul * (a.outstandingCents - b.outstandingCents);
    }
  });
}

/* ---------------------------------- exports --------------------------------- */

function csvCell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildReportCsv(report: BillingReport, agencyName: string) {
  const lines: string[] = [];
  lines.push(csvCell(`${agencyName} — financial report`));
  lines.push(csvCell(`Period: ${report.period.label}`));
  lines.push("");
  lines.push(["Type", "Number", "Talent", "Client", "Status", "Issued", "Due", "Paid", "Currency", "Amount"].join(","));
  for (const r of report.lineItems) {
    lines.push([
      r.kind === "quote" ? "Quote" : "Invoice",
      r.number,
      r.talent_name ?? "Unassigned",
      r.client_name ?? "",
      r.status,
      r.issued_at.slice(0, 10),
      r.due_date?.slice(0, 10) ?? "",
      r.status === "paid" ? (r.paid_at ?? r.issued_at).slice(0, 10) : "",
      r.currency,
      (r.total_cents / 100).toFixed(2),
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildReportHtml(
  report: BillingReport,
  agencyName: string,
  money: (cents: number, currency?: string) => string,
) {
  const cur = report.currency;
  const table = (title: string, rows: ReportBucket[], head: string) => `
    <h2>${esc(title)}</h2>
    ${rows.length === 0
      ? `<p class="empty">No activity in this period.</p>`
      : `<table>
      <thead><tr><th>${esc(head)}</th><th>Quoted</th><th>Invoiced</th><th>Received</th><th>Outstanding</th></tr></thead>
      <tbody>
      ${rows.map((r) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="n">${money(r.quotedCents, cur)}</td>
        <td class="n">${money(r.invoicedCents, cur)}</td>
        <td class="n">${money(r.receivedCents, cur)}</td>
        <td class="n">${money(r.outstandingCents, cur)}</td>
      </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td>Total</td>
        <td class="n">${money(rows.reduce((s, r) => s + r.quotedCents, 0), cur)}</td>
        <td class="n">${money(rows.reduce((s, r) => s + r.invoicedCents, 0), cur)}</td>
        <td class="n">${money(rows.reduce((s, r) => s + r.receivedCents, 0), cur)}</td>
        <td class="n">${money(rows.reduce((s, r) => s + r.outstandingCents, 0), cur)}</td>
      </tr></tfoot>
    </table>`}`;

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>${esc(agencyName)} — financial report — ${esc(report.period.label)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#12211f; margin:32px; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:14px; margin:24px 0 8px; text-transform:uppercase; letter-spacing:.04em; color:#0f766e; }
  .meta { color:#5c6b68; font-size:12px; margin-bottom:20px; }
  .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .card { border:1px solid #dfe6e4; border-radius:8px; padding:10px 12px; }
  .card .v { font-size:16px; font-weight:700; }
  .card .l { font-size:11px; color:#5c6b68; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:6px 8px; border-bottom:1px solid #e6ecea; }
  th { background:#f2f7f6; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#5c6b68; }
  td.n, th:not(:first-child) { text-align:right; }
  tfoot td { font-weight:700; border-top:2px solid #0f766e; }
  .empty { font-size:12px; color:#5c6b68; }
  @media print { body { margin:14mm; } }
</style></head><body>
<h1>${esc(agencyName)} — financial report</h1>
<div class="meta">Period: ${esc(report.period.label)} · Generated ${esc(fmtDayLabel(iso(new Date())))}</div>
<div class="cards">
  <div class="card"><div class="v">${money(report.quotedCents, cur)}</div><div class="l">Total quoted · ${report.quotedCount} quote(s)</div></div>
  <div class="card"><div class="v">${money(report.invoicedCents, cur)}</div><div class="l">Total invoiced · ${report.invoicedCount} invoice(s)</div></div>
  <div class="card"><div class="v">${money(report.receivedCents, cur)}</div><div class="l">Total received · ${report.receivedCount} payment(s)</div></div>
  <div class="card"><div class="v">${money(report.outstandingCents, cur)}</div><div class="l">Total outstanding · ${report.outstandingCount} unpaid${report.overdueCount ? `, ${report.overdueCount} overdue` : ""}</div></div>
</div>
${table("Breakdown by talent", report.byTalent, "Talent")}
${table("Breakdown by client", report.byClient, "Client")}
</body></html>`;
}

export function printReportHtml(html: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
  return true;
}
