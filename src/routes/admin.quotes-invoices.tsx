import { createFileRoute } from "@tanstack/react-router";
import { Download, Info, Eye, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/admin/quotes-invoices")({
  head: () => ({ meta: [{ title: "Quotes & Invoices · TalVault Admin" }] }),
  component: QuotesInvoicesPage,
});

type Doc = {
  id: string;
  agency: string;
  type: "Quote" | "Invoice";
  number: string;
  client: string;
  issued: string;
  currency: "ZAR" | "USD" | "EUR";
  total: number;
  status: "Draft" | "Sent" | "Accepted" | "Paid" | "Overdue" | "Cancelled";
  tone: string;
};

const seed: Doc[] = [
  { id: "d1", agency: "Mbeki Sports Management", type: "Invoice", number: "INV-2026-0142", client: "Springbok Union", issued: "3 Jun 2026", currency: "ZAR", total: 245000, status: "Paid", tone: "green" },
  { id: "d2", agency: "Mbeki Sports Management", type: "Quote", number: "QUO-2026-0071", client: "PSL Broadcasting", issued: "1 Jun 2026", currency: "ZAR", total: 128500, status: "Sent", tone: "blue" },
  { id: "d3", agency: "StarBurst Talent Agency", type: "Invoice", number: "INV-2026-0091", client: "Netflix ZA", issued: "28 May 2026", currency: "USD", total: 18200, status: "Overdue", tone: "red" },
  { id: "d4", agency: "StarBurst Talent Agency", type: "Quote", number: "QUO-2026-0044", client: "Showmax", issued: "22 May 2026", currency: "ZAR", total: 92000, status: "Accepted", tone: "green" },
  { id: "d5", agency: "Creative Artists Hub", type: "Invoice", number: "INV-2026-0163", client: "SABC", issued: "8 Jun 2026", currency: "ZAR", total: 54300, status: "Sent", tone: "blue" },
  { id: "d6", agency: "Elite Performers SA", type: "Quote", number: "QUO-2026-0058", client: "M-Net", issued: "18 May 2026", currency: "ZAR", total: 41200, status: "Draft", tone: "neutral" },
  { id: "d7", agency: "Elite Performers SA", type: "Invoice", number: "INV-2026-0110", client: "kykNET", issued: "24 May 2026", currency: "ZAR", total: 76800, status: "Cancelled", tone: "neutral" },
];

const statusTone: Record<Doc["status"], string> = {
  Draft: "neutral", Sent: "blue", Accepted: "green", Paid: "green", Overdue: "red", Cancelled: "neutral",
};

type AuditEntry = { id: number; actor: string; action: string; target: string; at: string };
const ACTOR = "Thandi M.";

function nowStamp() {
  return new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(v: number, ccy: Doc["currency"]) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(v);
}

function QuotesInvoicesPage() {
  const [rows] = useState<Doc[]>(seed);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | Doc["type"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Doc["status"]>("all");
  const [toast, setToast] = useState<string | null>(null);

  const agencies = useMemo(() => Array.from(new Set(rows.map((r) => r.agency))), [rows]);

  const visible = useMemo(() => rows.filter((r) =>
    (agencyFilter === "all" || r.agency === agencyFilter) &&
    (typeFilter === "all" || r.type === typeFilter) &&
    (statusFilter === "all" || r.status === statusFilter),
  ), [rows, agencyFilter, typeFilter, statusFilter]);

  const byAgency = useMemo(() => {
    const map = new Map<string, { quotes: number; invoices: number; paid: number; overdue: number; outstanding: number }>();
    for (const r of visible) {
      const cur = map.get(r.agency) ?? { quotes: 0, invoices: 0, paid: 0, overdue: 0, outstanding: 0 };
      if (r.type === "Quote") cur.quotes += 1;
      else cur.invoices += 1;
      if (r.status === "Paid") cur.paid += r.total;
      if (r.status === "Overdue") cur.overdue += r.total;
      if (r.type === "Invoice" && (r.status === "Sent" || r.status === "Overdue")) cur.outstanding += r.total;
      map.set(r.agency, cur);
    }
    return Array.from(map.entries());
  }, [visible]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const log = (action: string, target: string) => {
    setAudit((a) => [
      { id: Date.now() + Math.random(), actor: ACTOR, action, target, at: nowStamp() },
      ...a,
    ].slice(0, 50));
  };

  const viewDoc = (d: Doc) => {
    log(`Viewed ${d.type.toLowerCase()} (read-only)`, `${d.agency} · ${d.number}`);
    flash(`Opened ${d.number} in read-only preview. Admin cannot edit agency documents.`);
  };

  const exportCsv = () => {
    const headers = ["Agency", "Type", "Number", "Client", "Issued", "Currency", "Total", "Status"];
    const csvRows = visible.map((r) => [r.agency, r.type, r.number, r.client, r.issued, r.currency, String(r.total), r.status]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotes-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log("Exported quotes & invoices CSV", `Rows: ${visible.length}`);
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Quotes & Invoices</h1>
          <div className="tvp-subtitle">Reporting view of agency quote and invoice totals and statuses.</div>
        </div>
        <div className="tvp-actions">
          <span className="tvp-muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Lock className="h-3.5 w-3.5" /> Read-only
          </span>
          <button className="tvp-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />Export
          </button>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>Admin reporting only.</strong> Admin cannot edit agency quotes or invoices. View and
          export actions are audit logged.
        </div>
      </div>

      <div className="tvp-card tvp-panel" style={{ marginBottom: 16 }}>
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Totals by agency</h2>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Quotes</th>
                <th>Invoices</th>
                <th>Paid (ZAR)</th>
                <th>Outstanding (ZAR)</th>
                <th>Overdue (ZAR)</th>
              </tr>
            </thead>
            <tbody>
              {byAgency.length === 0 && (
                <tr><td colSpan={6} className="tvp-muted">No records match the current filters.</td></tr>
              )}
              {byAgency.map(([agency, s]) => (
                <tr key={agency}>
                  <td><strong>{agency}</strong></td>
                  <td>{s.quotes}</td>
                  <td>{s.invoices}</td>
                  <td>{fmtMoney(s.paid, "ZAR")}</td>
                  <td>{fmtMoney(s.outstanding, "ZAR")}</td>
                  <td>
                    {s.overdue > 0 ? (
                      <span className="tvp-status tvp-red">{fmtMoney(s.overdue, "ZAR")}</span>
                    ) : (
                      fmtMoney(0, "ZAR")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search by number or client..." />
          <div className="tvp-row-actions" style={{ flexWrap: "wrap" }}>
            <select
              className="tvp-select"
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
            >
              <option value="all">Agency: All</option>
              {agencies.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              className="tvp-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | Doc["type"])}
            >
              <option value="all">Type: All</option>
              <option value="Quote">Quote</option>
              <option value="Invoice">Invoice</option>
            </select>
            <select
              className="tvp-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | Doc["status"])}
            >
              <option value="all">Status: All</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Agency</th>
                <th>Client</th>
                <th>Issued</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.number}</strong></td>
                  <td>{d.type}</td>
                  <td>{d.agency}</td>
                  <td>{d.client}</td>
                  <td>{d.issued}</td>
                  <td>{fmtMoney(d.total, d.currency)}</td>
                  <td><span className={`tvp-status tvp-${statusTone[d.status]}`}>{d.status}</span></td>
                  <td className="tvp-row-actions">
                    <button
                      className="tvp-mini-btn"
                      title="View (read-only)"
                      onClick={() => viewDoc(d)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="tvp-mini-btn"
                      disabled
                      title="Admin cannot edit agency quotes or invoices"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="tvp-muted">No records match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tvp-card tvp-panel" style={{ marginTop: 16 }}>
        <div className="tvp-panel-head">
          <h2 className="tvp-h2"><ShieldCheck className="h-4 w-4 inline mr-1" /> Quotes & Invoices audit trail</h2>
          <span className="tvp-muted">Session-only view</span>
        </div>
        {audit.length === 0 ? (
          <div className="tvp-muted" style={{ padding: "8px 2px" }}>
            No actions in this session yet. View and export actions on this screen are logged here.
          </div>
        ) : (
          <table className="tvp-table">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{a.at}</td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td>{a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 70,
            background: "#142033", color: "#fff", padding: "10px 14px",
            borderRadius: 8, maxWidth: 360, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
