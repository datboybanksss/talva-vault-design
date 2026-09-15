import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileDown, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { printHtmlDocument } from "@/lib/billing-reports";
import { buildAdminReportingHtml } from "@/lib/admin-print";
import { getReportingSummary } from "@/lib/admin-reporting.functions";
import type { ReportingMetric } from "@/lib/admin-reporting.functions";
import { ReportingRawDrawer } from "@/components/admin/reporting-raw-drawer";

export const Route = createFileRoute("/admin/reporting")({
  head: () => ({
    meta: [
      { title: "Reporting · TalVault Admin" },
      {
        name: "description",
        content:
          "Platform growth, engagement, financial and retention metrics for any date range, with raw data drill-down.",
      },
      { property: "og:title", content: "Reporting · TalVault Admin" },
      {
        property: "og:description",
        content: "Growth, engagement, financial and retention metrics across the TalVault platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportingPage,
});

// -----------------------------------------------------------------------------
// Date range
// -----------------------------------------------------------------------------

type Preset = "30d" | "90d" | "mtd" | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "Month to date",
  custom: "Custom range",
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(p: Preset): { from: string; to: string } {
  const today = new Date();
  const to = iso(today);
  if (p === "mtd") {
    return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to };
  }
  const days = p === "90d" ? 89 : 29;
  return { from: iso(new Date(today.getTime() - days * 86400000)), to };
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

const zar = (cents: number) =>
  `R ${(Number(cents ?? 0) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Delta({ value, unit }: { value: number; unit: string }) {
  const rounded = Math.round(value * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  const tone = rounded > 0 ? "var(--tvp-green)" : rounded < 0 ? "var(--tvp-red)" : undefined;
  return (
    <span className="tvp-muted" style={{ fontSize: 12, color: tone, fontWeight: 700 }}>
      <Icon className="h-3 w-3 inline" />
      {rounded > 0 ? "+" : ""}
      {rounded}
      {unit} vs prior period
    </span>
  );
}

function Card({
  label,
  value,
  sub,
  note,
  metric,
  onDrill,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  note?: string;
  metric?: ReportingMetric;
  onDrill?: (metric: ReportingMetric, title: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="tvp-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="tvp-kpi-label">{label}</div>
      <div className="tvp-kpi-value" style={{ fontSize: 26 }}>{value}</div>
      {sub && <div className="tvp-muted" style={{ fontSize: 12 }}>{sub}</div>}
      {children}
      {note && <div className="tvp-muted" style={{ fontSize: 11, fontStyle: "italic" }}>{note}</div>}
      {metric && onDrill && (
        <button
          className="tvp-link"
          style={{ alignSelf: "flex-start", marginTop: 6, fontSize: 12, fontWeight: 700 }}
          onClick={() => onDrill(metric, label)}
        >
          View raw data
        </button>
      )}
    </div>
  );
}

function ReportingPage() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState(presetRange("30d"));
  const range = preset === "custom" ? custom : presetRange(preset);
  const [drill, setDrill] = useState<{ metric: ReportingMetric; title: string } | null>(null);

  const summaryFn = useServerFn(getReportingSummary);
  const q = useQuery({
    queryKey: ["admin", "reporting", range.from, range.to],
    queryFn: () => summaryFn({ data: { from: range.from, to: range.to } }) as Promise<any>,
  });

  const d = q.data;
  const trackingNote = useMemo(() => {
    if (!d) return undefined;
    if (!d.trackingSince) return "Tracking starts with the first recorded talent activity.";
    return `Tracking since ${new Date(d.trackingSince).toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    })}`;
  }, [d]);

  function exportSnapshot() {
    if (!d) return;
    const rows: (string | number)[][] = [
      ["TalVault platform reporting snapshot"],
      ["Period", `${d.period.from} to ${d.period.to}`],
      ["Prior period", `${d.prior.from} to ${d.prior.to}`],
      ["Generated", new Date(d.generatedAt).toLocaleString("en-ZA")],
      [],
      ["Metric", "Value", "Context"],
      ["Two-sided engagement (north star)", `${d.northStar.pct}%`, `${d.northStar.active} of ${d.northStar.total} live agency-talent relationships active on both sides`],
      ["Agencies added", d.growth.agenciesAdded, `${d.growth.agenciesAddedPrior} in prior period`],
      ["Invite-to-acceptance rate", `${d.growth.acceptanceRate}%`, `${d.growth.invitesAccepted} of ${d.growth.invitesSent} invitations`],
      ["Median time to accept (days)", d.growth.medianDaysToAccept ?? "No acceptances", `${d.growth.acceptedInPeriod} accepted in period`],
      ["Talent active in period", d.engagement.activeTalent, `of ${d.engagement.totalTalent} onboarded talent`],
      ["Agencies with an active talent share", d.engagement.agenciesWithShare, `${d.engagement.sharesCreated} shares created`],
      ["Documents uploaded", d.engagement.documentsUploaded, `${d.engagement.sharedDocuments} shared, ${d.engagement.privateDocuments} private`],
      ["Quotes generated", d.financials.quotesCount, zar(d.financials.quotesValueCents)],
      ["Invoices generated", d.financials.invoicesCount, zar(d.financials.invoicesValueCents)],
      ["Amount received", zar(d.financials.receivedCents), `${d.financials.paymentsCount} payments, including partial payments`],
      ["Outstanding", zar(d.financials.outstandingCents), "Invoiced in period, not yet received"],
      [],
      ["Cohort month", "Talent onboarded", "Active at 30 days", "Active at 60 days", "Active at 90 days"],
      ...d.cohorts.map((c: any) => [
        c.month, c.size,
        c.d30.mature ? `${Math.round((c.d30.active / c.d30.mature) * 100)}%` : "Not yet due",
        c.d60.mature ? `${Math.round((c.d60.active / c.d60.mature) * 100)}%` : "Not yet due",
        c.d90.mature ? `${Math.round((c.d90.active / c.d90.mature) * 100)}%` : "Not yet due",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            const s = c == null ? "" : String(c);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `talvault-reporting-${d.period.from}-to-${d.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const onDrill = (metric: ReportingMetric, title: string) => setDrill({ metric, title });
  const pctOf = (n: number, dn: number) => (dn > 0 ? Math.round((n / dn) * 100) : 0);

  return (
    <>
      <div className="tvp-topbar" style={{ alignItems: "center" }}>
        <div>
          <h1 className="tvp-h1">Reporting</h1>
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            Growth, engagement, financial and retention metrics for the selected period.
          </p>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary" onClick={exportSnapshot} disabled={!d}>
            <Download className="h-4 w-4" /> Export snapshot
          </button>
          <button
            className="tvp-secondary"
            onClick={() => d && printHtmlDocument(buildAdminReportingHtml(d))}
            disabled={!d}
          >
            <FileDown className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <div className="tvp-card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="flex items-end gap-3" style={{ flexWrap: "wrap" }}>
          <div className="tvp-form-group" style={{ minWidth: 200 }}>
            <label>Date range</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
                <option key={p} value={p}>{PRESET_LABEL[p]}</option>
              ))}
            </select>
          </div>
          {preset === "custom" && (
            <>
              <div className="tvp-form-group">
                <label>From</label>
                <input
                  type="date"
                  value={custom.from}
                  max={custom.to}
                  onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                />
              </div>
              <div className="tvp-form-group">
                <label>To</label>
                <input
                  type="date"
                  value={custom.to}
                  min={custom.from}
                  onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                />
              </div>
            </>
          )}
          <span className="tvp-muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {d
              ? `As of ${new Date(d.generatedAt).toLocaleString("en-ZA")}`
              : "Calculating metrics…"}
          </span>
        </div>
      </div>

      {q.isError && (
        <div className="tvp-card" style={{ padding: 20 }}>
          <p className="tvp-muted">
            These metrics could not be calculated. Refresh the page to try again.
          </p>
        </div>
      )}

      {d && (
        <>
          {/* North star */}
          <h2 className="tvp-h2" style={{ marginBottom: 10 }}>North star</h2>
          <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Card
              label="Two-sided engagement (agency and talent)"
              value={`${d.northStar.pct}%`}
              sub={`${d.northStar.active} of ${d.northStar.total} live agency–talent relationships had activity from both sides${
                d.northStar.talentOnlyCount || d.northStar.agencyOnlyCount
                  ? ` · ${d.northStar.talentOnlyCount} talent only, ${d.northStar.agencyOnlyCount} agency only`
                  : ""
              }`}
              note={`${trackingNote ?? ""} · Quotes and invoices are not counted yet — they cannot be tied to a specific talent.`}
              metric="north_star_pairs"
              onDrill={onDrill}
            >
              <Delta value={d.northStar.pct - d.northStar.priorPct} unit="pts" />
            </Card>
          </div>

          {/* Growth & funnel */}
          <h2 className="tvp-h2" style={{ marginBottom: 10 }}>Growth &amp; funnel</h2>
          <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Card
              label="Agencies added"
              value={String(d.growth.agenciesAdded)}
              metric="agencies_added"
              onDrill={onDrill}
            >
              <Delta value={d.growth.agenciesAdded - d.growth.agenciesAddedPrior} unit="" />
            </Card>
            <Card
              label="Invite-to-acceptance rate"
              value={`${d.growth.acceptanceRate}%`}
              sub={`${d.growth.invitesAccepted} of ${d.growth.invitesSent} invitations sent in period`}
              metric="invitations"
              onDrill={onDrill}
            />
            <Card
              label="Median time to accept"
              value={
                d.growth.medianDaysToAccept == null
                  ? "No acceptances"
                  : `${d.growth.medianDaysToAccept} days`
              }
              sub={`${d.growth.acceptedInPeriod} invitation${d.growth.acceptedInPeriod === 1 ? "" : "s"} accepted in period`}
              metric="invitations_accepted"
              onDrill={onDrill}
            />
          </div>

          {/* Engagement */}
          <h2 className="tvp-h2" style={{ marginBottom: 10 }}>Engagement &amp; activity</h2>
          <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Card
              label="Talent active in period"
              value={`${d.engagement.activeTalent} / ${d.engagement.totalTalent}`}
              sub={`${pctOf(d.engagement.activeTalent, d.engagement.totalTalent)}% of onboarded talent`}
              note={trackingNote}
              metric="active_talent"
              onDrill={onDrill}
            />
            <Card
              label="Agencies with an active talent share"
              value={String(d.engagement.agenciesWithShare)}
              sub={`${d.engagement.sharesCreated} share${d.engagement.sharesCreated === 1 ? "" : "s"} created in period`}
              metric="shares"
              onDrill={onDrill}
            />
            <Card
              label="Documents uploaded"
              value={String(d.engagement.documentsUploaded)}
              sub={`${d.engagement.sharedDocuments} shared with agencies, ${d.engagement.privateDocuments} in private vaults`}
              metric="documents_uploaded"
              onDrill={onDrill}
            />
          </div>

          {/* Financials */}
          <h2 className="tvp-h2" style={{ marginBottom: 10 }}>Financials</h2>
          <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Card
              label="Quotes generated"
              value={String(d.financials.quotesCount)}
              sub={zar(d.financials.quotesValueCents)}
              metric="quotes"
              onDrill={onDrill}
            />
            <Card
              label="Invoices generated"
              value={String(d.financials.invoicesCount)}
              sub={zar(d.financials.invoicesValueCents)}
              metric="invoices"
              onDrill={onDrill}
            />
            <Card
              label="Amount received"
              value={zar(d.financials.receivedCents)}
              sub={`${d.financials.paymentsCount} payment${d.financials.paymentsCount === 1 ? "" : "s"} dated in this period`}
              note="Includes partial payments, counted on the date the money was received."
              metric="payments_received"
              onDrill={onDrill}
            />
            <Card
              label="Outstanding"
              value={zar(d.financials.outstandingCents)}
              sub="Invoiced in this period and not yet received"
              metric="outstanding"
              onDrill={onDrill}
            />
          </div>

          {/* Cohort retention */}
          <h2 className="tvp-h2" style={{ marginBottom: 10 }}>Cohort retention</h2>
          <div className="tvp-table-wrap" style={{ marginBottom: 32 }}>
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Onboarding month</th>
                  <th>Talent onboarded</th>
                  <th>Active at 30 days</th>
                  <th>Active at 60 days</th>
                  <th>Active at 90 days</th>
                </tr>
              </thead>
              <tbody>
                {d.cohorts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="tvp-muted" style={{ padding: 20 }}>
                      No talent onboarded up to the end of this period yet.
                    </td>
                  </tr>
                )}
                {d.cohorts.map((c: any) => (
                  <tr key={c.month}>
                    <td>
                      {new Date(`${c.month}-01T00:00:00Z`).toLocaleDateString("en-ZA", {
                        month: "long", year: "numeric",
                      })}
                    </td>
                    <td>{c.size}</td>
                    {[c.d30, c.d60, c.d90].map((w: any, i: number) => (
                      <td key={i}>
                        {w.mature === 0 ? (
                          <span className="tvp-muted">Not yet due</span>
                        ) : (
                          `${Math.round((w.active / w.mature) * 100)}% (${w.active} of ${w.mature})`
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tvp-muted" style={{ fontSize: 11, padding: "8px 4px", fontStyle: "italic" }}>
              {trackingNote} · Cohorts only count talent whose window has already closed.
            </p>
          </div>
        </>
      )}

      {drill && (
        <ReportingRawDrawer
          metric={drill.metric}
          title={drill.title}
          from={range.from}
          to={range.to}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}
