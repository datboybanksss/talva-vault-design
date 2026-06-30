import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, MoreVertical, FileSpreadsheet, Receipt, Clock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/agency/quotes-invoices")({
  head: () => ({ meta: [{ title: "Quotes & Invoices · TalVault Agency" }] }),
  component: QIPage,
});

const records = [
  { ref: "QT-2026-014", client: "Brand X Africa", talent: "Caster Semenya", kind: "Quote", kindTone: "blue", status: "Sent", statusTone: "blue", amount: "R 84,500", due: "Awaiting acceptance" },
  { ref: "INV-2026-052", client: "TVZA Productions", talent: "Neo Khumalo", kind: "Invoice", kindTone: "purple", status: "Paid", statusTone: "green", amount: "R 32,000", due: "Paid 14 Jun 2026" },
  { ref: "INV-2026-049", client: "Brand X Africa", talent: "Caster Semenya", kind: "Invoice", kindTone: "purple", status: "Late", statusTone: "red", amount: "R 56,200", due: "Late by 6 days" },
  { ref: "QT-2026-012", client: "Stadium Live", talent: "Lara Maseko", kind: "Quote", kindTone: "blue", status: "Expired", statusTone: "amber", amount: "R 18,750", due: "Quote expired" },
];

const clients = [
  { name: "Brand X Africa", contact: "ops@brandxafrica.com", live: 3, paid: "R 142,000" },
  { name: "TVZA Productions", contact: "billing@tvza.tv", live: 1, paid: "R 32,000" },
  { name: "Stadium Live", contact: "accounts@stadium.live", live: 0, paid: "R 0" },
];

function QIPage() {
  const [tab, setTab] = useState<"records" | "clients" | "settings">("records");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Quotes & Invoices</h1>
          <div className="tvp-subtitle">Agency-side records. Talent income is captured separately in the Talent portal.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary">New Quote</button>
          <button className="tvp-primary"><Plus className="h-4 w-4" />New Invoice</button>
        </div>
      </div>

      <div className="tvp-subtabs">
        <button className={`tvp-subtab${tab === "records" ? " tvp-active" : ""}`} onClick={() => setTab("records")}>Quotes & Invoices</button>
        <button className={`tvp-subtab${tab === "clients" ? " tvp-active" : ""}`} onClick={() => setTab("clients")}>Clients</button>
        <button className={`tvp-subtab${tab === "settings" ? " tvp-active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
      </div>

      {tab === "records" && (
        <>
          <div className="tvp-finance-grid">
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Outstanding</div><div className="tvp-amount">R 174,950</div><div className="tvp-note">Across 7 invoices</div></div>
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Paid (90d)</div><div className="tvp-amount">R 412,000</div><div className="tvp-note">Across 12 invoices</div></div>
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Quotes pending</div><div className="tvp-amount">R 96,200</div><div className="tvp-note">3 awaiting acceptance</div></div>
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Late</div><div className="tvp-amount" style={{ color: "var(--tvp-red)" }}>R 56,200</div><div className="tvp-note">2 invoices flagged</div></div>
          </div>

          <div className="tvp-card">
            <div className="tvp-toolbar">
              <input className="tvp-search" placeholder="Search records..." />
              <div className="flex gap-2">
                <select className="tvp-select"><option>Type: All</option><option>Quote</option><option>Invoice</option></select>
                <select className="tvp-select"><option>Status: All</option><option>Sent</option><option>Paid</option><option>Late</option><option>Expired</option></select>
                <select className="tvp-select"><option>Client: All</option><option>Brand X Africa</option></select>
              </div>
            </div>
            <table className="tvp-table">
              <thead><tr><th>Ref</th><th>Client</th><th>Talent</th><th>Type</th><th>Status</th><th>Amount</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.ref}>
                    <td><strong>{r.ref}</strong></td>
                    <td>{r.client}</td>
                    <td>{r.talent}</td>
                    <td><span className={`tvp-status tvp-${r.kindTone}`}>{r.kind}</span></td>
                    <td><span className={`tvp-status tvp-${r.statusTone}`}>{r.status}</span></td>
                    <td>{r.amount}</td>
                    <td className="tvp-muted">{r.due}</td>
                    <td><button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "clients" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Clients</h2>
            <button className="tvp-primary"><Plus className="h-4 w-4" />Add client</button>
          </div>
          <table className="tvp-table">
            <thead><tr><th>Client</th><th>Contact</th><th>Live records</th><th>Total paid</th><th></th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.contact}</td>
                  <td>{c.live}</td>
                  <td>{c.paid}</td>
                  <td><button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <div className="tvp-rule-grid">
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><Clock className="inline h-4 w-4 mr-1" />Quote Acceptance</h3><div className="tvp-form-group"><label>Accept within</label><select><option>7 days</option><option>14 days</option><option>30 days</option></select></div><p className="tvp-muted" style={{ fontSize: 12 }}>Quotes expire if not accepted in this window.</p></div>
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><Receipt className="inline h-4 w-4 mr-1" />Invoice Payment</h3><div className="tvp-form-group"><label>Pay within</label><select><option>14 days</option><option>30 days</option></select></div><p className="tvp-muted" style={{ fontSize: 12 }}>Invoices become late after this period.</p></div>
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><AlertTriangle className="inline h-4 w-4 mr-1" />Payment capture</h3><div className="tvp-form-group"><label>Allowed</label><select><option>Full or partial</option><option>Full only</option></select></div><p className="tvp-muted" style={{ fontSize: 12 }}>Agency users manually capture payment status.</p></div>
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><FileSpreadsheet className="inline h-4 w-4 mr-1" />VAT / Tax</h3><div className="tvp-form-group"><label>Default</label><select><option>No VAT by default</option><option>VAT applies by default</option></select></div><div className="tvp-form-group"><label>Default rate</label><input defaultValue="15%" /></div></div>
        </div>
      )}
    </>
  );
}
