import { createFileRoute } from "@tanstack/react-router";
import { Download, Eye, Lock, Wallet, CheckCircle2, AlertCircle, FileText } from "lucide-react";
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
const statusLabel: Record<string, string> = {
  draft: "Draft", sent: "Sent", accepted: "Accepted", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};

type ChipKey = "all" | "draft" | "sent" | "accepted" | "paid" | "overdue";
const CHIPS: Array<{ key: ChipKey; label: string; tone: string }> = [
  { key: "all", label: "All", tone: "teal" },
  { key: "draft", label: "Drafts", tone: "neutral" },
  { key: "sent", label: "Sent", tone: "blue" },
  { key: "accepted", label: "Accepted", tone: "green" },
  { key: "paid", label: "Paid", tone: "green" },
  { key: "overdue", label: "Overdue", tone: "red" },
];

function fmtMoney(cents: number, ccy: string) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: ccy, maximumFractionDigits: 0,
  }).format(cents / 100);
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
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
  const [chipFilter, setChipFilter] = useState<ChipKey>("all");
  const [search, setSearch] = useState("");

  const rows = q.data ?? [];
  const agencies = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r.agency_name))) as string[],
    [rows],
  );

  const chipCounts = useMemo(() => {
    const c: Record<ChipKey, number> = {
      all: rows.length, draft: 0, sent: 0, accepted: 0, paid: 0, overdue: 0,
    };
    for (const r of rows) {
      if (r.status in c) c[r.status as ChipKey] = (c[r.status as ChipKey] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const kpis = useMemo(() => {
    let outstanding = 0;
    let paid30 = 0;
    let overdueAmt = 0;
    let overdueCount = 0;
    for (const r of rows) {
      if (r.kind === "invoice" && (r.status === "sent" || r.status === "overdue")) {
        outstanding += r.total_cents;
      }
      if (r.status === "paid" && daysAgo(r.issued_at) <= 30) {
        paid30 += r.total_cents;
      }
      if (r.status === "overdue") {
        overdueAmt += r.total_cents;
        overdueCount += 1;
      }
    }
    return {
      total: rows.length,
      outstanding,
      paid30,
      overdueAmt,
      overdueCount,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (agencyFilter !== "all" && r.agency_name !== agencyFilter) return false;
      if (typeFilter !== "all" && r.kind !== typeFilter) return false;
      if (chipFilter !== "all" && r.status !== chipFilter) return false;
      if (s) {
        if (
          !(r.number ?? "").toLowerCase().includes(s) &&
          !(r.client_name ?? "").toLowerCase().includes(s) &&
          !(r.agency_name ?? "").toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [rows, agencyFilter, typeFilter, chipFilter, search]);

  const filtersActive =
    agencyFilter !== "all" || typeFilter !== "all" || chipFilter !== "all" || !!search;
  const resetFilters = () => {
    setAgencyFilter("all");
    setTypeFilter("all");
    setChipFilter("all");
    setSearch("");
  };

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

      {/* KPI row — platform-level rollups */}
      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.total}</div>
            <div className="tvp-kpi-label">Total Records</div>
            <div className="tvp-kpi-sub" style={{ color: "var(--tvp-muted)" }}>
              Across all agencies
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-amber"><Wallet className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value" style={{ fontSize: 22 }}>{fmtMoney(kpis.outstanding, "ZAR")}</div>
            <div className="tvp-kpi-label">Outstanding</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.outstanding > 0 ? "var(--tvp-amber)" : "var(--tvp-green)" }}>
              {kpis.outstanding > 0 ? "Sent / overdue invoices" : "Nothing outstanding"}
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value" style={{ fontSize: 22 }}>{fmtMoney(kpis.paid30, "ZAR")}</div>
            <div className="tvp-kpi-label">Paid (last 30d)</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.paid30 > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {kpis.paid30 > 0 ? "Recent settlements" : "No recent payments"}
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-red"><AlertCircle className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.overdueCount}</div>
            <div className="tvp-kpi-label">Overdue Invoices</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.overdueCount > 0 ? "var(--tvp-red)" : "var(--tvp-green)" }}>
              {kpis.overdueCount > 0 ? fmtMoney(kpis.overdueAmt, "ZAR") + " overdue" : "None overdue"}
            </div>
          </div>
        </div>
      </div>

      {/* Chip row — status filter */}
      <div className="tvp-life-chips">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            className={`tvp-life-chip${chipFilter === c.key ? " tvp-active-filter" : ""} tvp-bg-${c.tone}`}
            onClick={() => setChipFilter(c.key)}
          >
            <div className="tvp-label">{c.label}</div>
            <div className="tvp-num">{chipCounts[c.key] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search number, client, agency..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
            {filtersActive && (
              <button className="tvp-link" onClick={resetFilters}>Reset filters</button>
            )}
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
                  <td><strong>{r.agency_name}</strong></td>
                  <td style={{ textTransform: "capitalize" }}>{r.kind}</td>
                  <td>{r.number}</td>
                  <td>{r.client_name ?? "—"}</td>
                  <td>{r.issued_at}</td>
                  <td>{fmtMoney(r.total_cents, r.currency)}</td>
                  <td><span className={`tvp-status tvp-${statusTone[r.status] ?? "neutral"}`}>{statusLabel[r.status] ?? r.status}</span></td>
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
