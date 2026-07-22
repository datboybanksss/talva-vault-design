import { Clock, Receipt, AlertTriangle, FileSpreadsheet, Info } from "lucide-react";

export function QuotesInvoicesSettingsPanel() {
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h2 className="tvp-h2">Quotes &amp; Invoices Settings</h2>
          <div className="tvp-subtitle">Defaults for quote acceptance, invoice payment, and tax handling.</div>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>Not yet wired.</strong> These panels are placeholders — settings persistence and payment
          capture will be enabled in a future release. Existing quote and invoice records are unaffected.
        </div>
      </div>

      <div className="tvp-rule-grid" style={{ marginTop: 14 }}>
        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3"><Clock className="inline h-4 w-4 mr-1" />Quote Acceptance</h3>
          <p className="tvp-muted" style={{ fontSize: 12 }}>
            Default acceptance window (days) and reminder cadence. Settings persistence is not wired yet.
          </p>
        </div>
        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3"><Receipt className="inline h-4 w-4 mr-1" />Invoice Payment</h3>
          <p className="tvp-muted" style={{ fontSize: 12 }}>
            Default payment terms and overdue thresholds. Mark invoices overdue manually via the Status
            dropdown for now.
          </p>
        </div>
        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3"><AlertTriangle className="inline h-4 w-4 mr-1" />Payment capture</h3>
          <p className="tvp-muted" style={{ fontSize: 12 }}>
            Full-only or partial payment tracking will be added when payment collection integrates.
          </p>
        </div>
        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3"><FileSpreadsheet className="inline h-4 w-4 mr-1" />VAT / Tax</h3>
          <p className="tvp-muted" style={{ fontSize: 12 }}>
            VAT breakdown (net / VAT / gross) is not yet available. Enter VAT-inclusive totals for now.
          </p>
        </div>
      </div>
    </>
  );
}
