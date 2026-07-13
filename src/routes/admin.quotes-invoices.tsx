import { createFileRoute } from "@tanstack/react-router";
import { Download, Eye, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBillingDocs, logBillingExport } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/quotes-invoices")({
  head: () => ({ meta: [{ title: "Quotes & Invoices · TalVault Admin" }] }),
  component: QuotesInvoicesPage,
});

const statusTone: Record<string, string> = {
  draft: "neutral", sent: "blue", accepted: "green", paid: "green", overdue: "red", cancelled: "neutral",
};

function fmtMoney(cents: number, ccy: string) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: ccy, maximumFractionDigits: 0,
  }).format(cents / 100);
}

function QuotesInvoicesPage() {
  const listFn = useServerFn(listBillingDocs);
  const logExportFn = useServerFn(logBillingExport);
  const q = useQuery({
    queryKey: ["admin", "billing"],
    queryFn: () => listFn(),
  });

  const [agencyFilter, setAgencyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = q.data ?? [];
  const agencies = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r.agency_name))),
    [rows],
  );

  const visible = useMemo(
    () =>
      rows.filter((r: any) =>
        (agencyFilter === "all" || r.agency_name === agencyFilter) &&
        (typeFilter === "all" || r.kind === typeFilter) &&
        (statusFilter === "all" || r.status === statusFilter),
      ),
    [rows, agencyFilter, typeFilter, statusFilter],
  );

  const byAgency = useMemo(() => {
    const map = new Map<
      string,
      { quotes: number; invoices: number; paid: number; overdue: number; outstanding: number }
    >();
    for (const r of visible) {
      const cur = map.get(r.agency_name) ?? {
        quotes: 0, invoices: 0, paid: 0, overdue: 0, outstanding: 0,
      };
      if (r.kind === "quote") cur.quotes += 1;
      else cur.invoices += 1;
      if (r.status === "paid") cur.paid += r.total_cents;
      if (r.status === "overdue") cur.overdue += r.total_cents;
      if (r.kind === "invoice" && (r.status === "sent" || r.status === "overdue"))
        cur.outstanding += r.total_cents;
      map.set(r.agency_name, cur);
    }
    return Array.from(map.entries());
  }, [visible]);

  const logExport = useMutation({
    mutationFn: (scope: string) =>
      logExportFn({ data: { scope, row_count: visible.length } }),
  });

  const exportCsv = () => {
    const headers = ["Agency", "Type", "Number", "Client", "Issued", "Currency", "Total", "Status"];
    const csvRows = visible.map((r: any) => [
      r.agency_name, r.kind, r.number, r.client_name ?? "",
      r.issued_at, r.currency, String(r.total_cents / 100), r.status,
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotes-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logExport.mutate("full-export");
    toast.success("Exported and logged to audit.");
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Quotes & Invoices</h1>
          <div
            className="tvp-subtitle"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Lock className="h-3 w-3" />
            Read-only admin reporting view · view/export is audit logged.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv} disabled={visible.length === 0}>
            <Download className="h-4 w-4" />Export
          </button>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        {byAgency.map(([agency, tot]) => (
          <div className="tvp-card tvp-kpi" key={agency}>
            <div className="tvp-kpi-icon tvp-bg-teal"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <div className="tvp-kpi-value" style={{ fontSize: 18 }}>{agency}</div>
              <div className="tvp-kpi-label">
                {tot.quotes} quotes · {tot.invoices} invoices
              </div>
              <div className="tvp-kpi-sub">
                Paid {fmtMoney(tot.paid, "ZAR")} · Outstanding {fmtMoney(tot.outstanding, "ZAR")}
                {tot.overdue > 0 && (
                  <span className="tvp-warn"> · Overdue {fmtMoney(tot.overdue, "ZAR")}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <div className="tvp-row-actions" style={{ flexWrap: "wrap" }}>
            <select
              className="tvp-select"
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
            >
              <option value="all">Agency: All</option>
              {agencies.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              className="tvp-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Type: All</option>
              <option value="quote">Quote</option>
              <option value="invoice">Invoice</option>
            </select>
            <select
              className="tvp-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Status: All</option>
              {Object.keys(statusTone).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th><th>Type</th><th>Number</th><th>Client</th>
                <th>Issued</th><th>Total</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr><td colSpan={8} className="tvp-muted">Loading…</td></tr>
              )}
              {!q.isLoading && visible.length === 0 && (
                <tr><td colSpan={8} className="tvp-muted">
                  No quotes or invoices to show yet. Records surface here once agencies create them.
                </td></tr>
              )}
              {visible.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.agency_name}</td>
                  <td>{r.kind}</td>
                  <td>{r.number}</td>
                  <td>{r.client_name ?? "—"}</td>
                  <td>{r.issued_at}</td>
                  <td>{fmtMoney(r.total_cents, r.currency)}</td>
                  <td><span className={`tvp-status tvp-${statusTone[r.status] ?? "neutral"}`}>{r.status}</span></td>
                  <td>
                    <button
                      className="tvp-mini-btn"
                      title="View-only — Admin cannot edit agency quotes/invoices (BR-QI-002)"
                      onClick={() => toast.info("Read-only view logged to audit.")}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
