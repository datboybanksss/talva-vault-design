import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Receipt, Wallet, Lock } from "lucide-react";
import { listTalentBillingDocuments } from "@/lib/talent.functions";
import { fmtMoney } from "@/lib/billing";

export const Route = createFileRoute("/talent/budget")({
  head: () => ({
    meta: [
      { title: "Budget & Income · TalVault Talent" },
      {
        name: "description",
        content:
          "View the quotes and invoices your Manager has shared with you — status, amounts and dates, in one private read-only place.",
      },
      { property: "og:title", content: "Budget & Income · TalVault Talent" },
      {
        property: "og:description",
        content:
          "Quotes and invoices shared by your Manager, read-only, in the TalVault Talent portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetPage,
});

type Kind = "all" | "quote" | "invoice";

function statusTone(status: string) {
  switch (status) {
    case "paid":
    case "accepted":
      return "green";
    case "overdue":
      return "red";
    case "sent":
      return "blue";
    case "cancelled":
      return "red";
    default:
      return "purple";
  }
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

function BudgetPage() {
  const load = useServerFn(listTalentBillingDocuments);
  const [kind, setKind] = useState<Kind>("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "billing-docs"],
    queryFn: () => load() as Promise<any>,
  });

  const documents: any[] = useMemo(() => data?.documents ?? [], [data]);
  const rows = documents.filter((d) => kind === "all" || d.kind === kind);

  const currency = documents[0]?.currency ?? "ZAR";
  const invoices = documents.filter((d) => d.kind === "invoice");
  const invoiced = invoices.reduce((s, d) => s + Number(d.total_cents), 0);
  const received = invoices.reduce((s, d) => s + Number(d.received_cents), 0);
  const outstanding = invoices.reduce((s, d) => s + Number(d.outstanding_cents), 0);

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Budget &amp; Income</h1>
          <div className="tvp-subtitle">
            Quotes and invoices your Manager has shared with you.
          </div>
        </div>
        <span className="tvp-lock-note">
          <Lock className="h-3 w-3" /> Read-only
        </span>
      </div>

      {isLoading && (
        <div className="tvp-card tvp-panel">
          <p className="tvp-muted">Loading your quotes and invoices…</p>
        </div>
      )}

      {isError && (
        <div className="tvp-card tvp-panel">
          <p className="tvp-warn">Failed to load: {(error as Error)?.message}</p>
        </div>
      )}

      {!isLoading && !isError && !data?.link && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">No active manager link</h2>
          <p className="tvp-muted" style={{ marginTop: 6 }}>
            You aren't currently linked to a Talent Manager. Once you're invited and
            accepted, anything your Manager shares with you appears here.
          </p>
        </div>
      )}

      {!isLoading && !isError && data?.link && (
        <>
          <div
            className="tvp-grid"
            style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 18 }}
          >
            <div className="tvp-card">
              <div className="tvp-kpi-icon tvp-bg-blue">
                <FileText className="h-5 w-5" />
              </div>
              <div className="tvp-kpi-label" style={{ marginTop: 10 }}>
                Invoiced
              </div>
              <div className="tvp-kpi-value">{fmtMoney(invoiced, currency)}</div>
            </div>
            <div className="tvp-card">
              <div className="tvp-kpi-icon tvp-bg-green">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="tvp-kpi-label" style={{ marginTop: 10 }}>
                Received
              </div>
              <div className="tvp-kpi-value">{fmtMoney(received, currency)}</div>
            </div>
            <div className="tvp-card">
              <div className="tvp-kpi-icon tvp-bg-amber">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="tvp-kpi-label" style={{ marginTop: 10 }}>
                Outstanding
              </div>
              <div className="tvp-kpi-value">{fmtMoney(outstanding, currency)}</div>
            </div>
          </div>

          <div className="tvp-card">
            <div className="tvp-panel-head">
              <div>
                <h2 className="tvp-h2">Quotes &amp; invoices</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {rows.length} document{rows.length === 1 ? "" : "s"} shared with you
                </p>
              </div>
              <select
                className="tvp-vault-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                aria-label="Filter by type"
              >
                <option value="all">Type: All</option>
                <option value="quote">Quotes</option>
                <option value="invoice">Invoices</option>
              </select>
            </div>

            {rows.length === 0 ? (
              <p className="tvp-muted" style={{ fontSize: 13, padding: "16px 0" }}>
                {documents.length === 0
                  ? "Your Manager hasn't shared any quotes or invoices with you yet."
                  : "No documents of this type have been shared with you."}
              </p>
            ) : (
              <div className="tvp-table-wrap">
                <table className="tvp-table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Type</th>
                      <th>Client</th>
                      <th>Issued</th>
                      <th>Due</th>
                      <th>Total</th>
                      <th>Received</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong>{d.number}</strong>
                          {d.description && (
                            <div className="tvp-muted" style={{ fontSize: 12 }}>
                              {d.description}
                            </div>
                          )}
                        </td>
                        <td>{d.kind === "quote" ? "Quote" : "Invoice"}</td>
                        <td>{d.client_name ?? "—"}</td>
                        <td>{fmtDate(d.issued_at)}</td>
                        <td>{fmtDate(d.due_date)}</td>
                        <td>{fmtMoney(Number(d.total_cents), d.currency ?? currency)}</td>
                        <td>
                          {d.kind === "invoice"
                            ? fmtMoney(Number(d.received_cents), d.currency ?? currency)
                            : "—"}
                        </td>
                        <td>
                          <span className={`tvp-status tvp-${statusTone(d.status)}`}>
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
