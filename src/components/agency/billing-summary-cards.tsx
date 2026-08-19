import { Coins, ReceiptText, Wallet, Flag } from "lucide-react";
import { fmtMoney } from "@/lib/billing";
import type { BillingReport } from "@/lib/billing-reports";

export function BillingSummaryCards({ report }: { report: BillingReport }) {
  const cur = report.currency;
  const allTime = report.period.key === "all";
  const inPeriod = allTime ? "all time" : "this period";

  return (
    <div className="tvp-grid tvp-kpi-grid">
      <div className="tvp-card tvp-kpi">
        <div className="tvp-kpi-icon tvp-bg-blue"><Coins className="h-5 w-5" /></div>
        <div>
          <div className="tvp-kpi-value">{fmtMoney(report.quotedCents, cur)}</div>
          <div className="tvp-kpi-label">Total Quoted ({report.period.label})</div>
          <div className="tvp-kpi-sub">
            {report.quotedCount > 0
              ? `${report.quotedCount} quote${report.quotedCount === 1 ? "" : "s"} in ${inPeriod}`
              : "No quotes in this period"}
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-kpi">
        <div className="tvp-kpi-icon tvp-bg-purple"><ReceiptText className="h-5 w-5" /></div>
        <div>
          <div className="tvp-kpi-value">{fmtMoney(report.invoicedCents, cur)}</div>
          <div className="tvp-kpi-label">Total Invoiced ({report.period.label})</div>
          <div className="tvp-kpi-sub">
            {report.invoicedCount > 0
              ? `${report.invoicedCount} invoice${report.invoicedCount === 1 ? "" : "s"} in ${inPeriod}`
              : "No invoices in this period"}
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-kpi">
        <div className="tvp-kpi-icon tvp-bg-green"><Wallet className="h-5 w-5" /></div>
        <div>
          <div className="tvp-kpi-value">{fmtMoney(report.receivedCents, cur)}</div>
          <div className="tvp-kpi-label">Total Received</div>
          <div className="tvp-kpi-sub">
            {report.receivedCents > 0
              ? allTime ? "As of today" : `Received in ${report.period.label}`
              : allTime ? "Nothing received yet" : "Nothing received in this period"}
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-kpi">
        <div className="tvp-kpi-icon tvp-bg-amber"><Flag className="h-5 w-5" /></div>
        <div>
          <div className="tvp-kpi-value">{fmtMoney(report.outstandingCents, cur)}</div>
          <div className="tvp-kpi-label">Total Outstanding</div>
          <div className="tvp-kpi-sub">
            {report.outstandingCount > 0
              ? `${report.outstandingCount} invoice${report.outstandingCount === 1 ? "" : "s"} unpaid${allTime ? "" : ` from ${report.period.label}`}`
              : allTime ? "Nothing outstanding" : "Nothing outstanding in this period"}
            {report.overdueCount > 0 && (
              <span style={{ color: "var(--tvp-red)", fontWeight: 600 }}> · {report.overdueCount} overdue</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
