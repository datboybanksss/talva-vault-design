import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";

const BillingTrendChart = lazy(() => import("./billing-trend-chart"));
import { Download, FileDown, ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/billing";
import {
  buildReportCsv, buildReportHtml, downloadCsv, printReportHtml, sortBuckets,
  type BillingReport, type BucketSortKey, type ReportBucket,
} from "@/lib/billing-reports";
import { BillingSummaryCards } from "./billing-summary-cards";
import { BillingPeriodSelector, type PeriodState } from "./billing-period-selector";

function BreakdownTable({
  title, head, rows, currency,
}: { title: string; head: string; rows: ReportBucket[]; currency: string }) {
  const [key, setKey] = useState<BucketSortKey>("invoiced");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const sorted = useMemo(() => sortBuckets(rows, key, dir), [rows, key, dir]);

  function th(label: string, k: BucketSortKey, numeric = true) {
    const active = key === k;
    return (
      <th style={{ textAlign: numeric ? "right" : "left" }}>
        <button
          type="button"
          className="tvp-sort-th"
          onClick={() => {
            if (active) setDir(dir === "asc" ? "desc" : "asc");
            else { setKey(k); setDir(numeric ? "desc" : "asc"); }
          }}
          aria-label={`Sort by ${label}`}
        >
          {label}
          {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </th>
    );
  }

  const totals = rows.reduce(
    (a, r) => ({
      q: a.q + r.quotedCents, i: a.i + r.invoicedCents,
      r: a.r + r.receivedCents, o: a.o + r.outstandingCents,
    }),
    { q: 0, i: 0, r: 0, o: 0 },
  );

  return (
    <div className="tvp-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--tvp-line)", fontWeight: 800 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="tvp-report-empty">No activity in this period.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tvp-table tvp-report-table">
            <thead>
              <tr>
                {th(head, "name", false)}
                {th("Quoted", "quoted")}
                {th("Invoiced", "invoiced")}
                {th("Received", "received")}
                {th("Outstanding", "outstanding")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td className="tvp-num">{fmtMoney(r.quotedCents, currency)}</td>
                  <td className="tvp-num">{fmtMoney(r.invoicedCents, currency)}</td>
                  <td className="tvp-num">{fmtMoney(r.receivedCents, currency)}</td>
                  <td className="tvp-num">{fmtMoney(r.outstandingCents, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="tvp-num"><strong>{fmtMoney(totals.q, currency)}</strong></td>
                <td className="tvp-num"><strong>{fmtMoney(totals.i, currency)}</strong></td>
                <td className="tvp-num"><strong>{fmtMoney(totals.r, currency)}</strong></td>
                <td className="tvp-num"><strong>{fmtMoney(totals.o, currency)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function BillingReportsPanel({
  report, period, onPeriodChange, agencyName,
}: {
  report: BillingReport;
  period: PeriodState;
  onPeriodChange: (p: PeriodState) => void;
  agencyName: string;
}) {
  const hasTrend = report.trend.some((t) => t.invoicedCents > 0 || t.receivedCents > 0);
  const safeName = (agencyName || "agency").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = `${safeName}-financial-report-${report.period.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="tvp-card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <BillingPeriodSelector value={period} onChange={onPeriodChange} label={report.period.label} />
        <div className="tvp-actions" data-tour="billing-export">
          <button
            className="tvp-secondary"
            onClick={() => {
              if (report.lineItems.length === 0) { toast.error("No records in this period to export"); return; }
              downloadCsv(`${slug}.csv`, buildReportCsv(report, agencyName));
              toast.success("CSV downloaded");
            }}
          >
            <Download className="h-4 w-4" />Export CSV
          </button>
          <button
            className="tvp-primary"
            onClick={() => {
              const ok = printReportHtml(buildReportHtml(report, agencyName, fmtMoney));
              if (!ok) toast.error("Allow pop-ups to export the PDF");
            }}
          >
            <FileDown className="h-4 w-4" />Export PDF
          </button>
        </div>
      </div>

      <BillingSummaryCards report={report} />

      <div className="tvp-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 12 }}>
          <TrendingUp className="h-4 w-4" style={{ color: "var(--tvp-teal, var(--teal-700))" }} />
          Invoiced vs received · last {report.trend.length} months
        </div>
        {!hasTrend ? (
          <div className="tvp-report-empty">No invoicing activity yet to chart.</div>
        ) : (
          <ClientOnly fallback={<div className="tvp-report-empty">Loading chart…</div>}>
            <Suspense fallback={<div className="tvp-report-empty">Loading chart…</div>}>
              <BillingTrendChart trend={report.trend} currency={report.currency} />
            </Suspense>
          </ClientOnly>
        )}
      </div>

      <BreakdownTable title="Breakdown by talent" head="Talent" rows={report.byTalent} currency={report.currency} />
      <BreakdownTable title="Breakdown by client" head="Client" rows={report.byClient} currency={report.currency} />
    </div>
  );
}
