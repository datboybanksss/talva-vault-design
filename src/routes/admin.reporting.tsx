import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportsFilterBar } from "@/components/admin/reports-filter-bar";
import { ReportsPeople } from "@/components/admin/reports-people";
import { SignInActivity } from "@/components/admin/sign-in-activity";
import { ReportDefinition } from "@/components/admin/report-definition";
import { LaunchReports } from "@/components/admin/launch-reports";
import {
  REPORT_TABS,
  REPORT_TAB_LABELS,
  ReportFilters,
  reportDefaults,
  reportPeriod,
  roleCan,
  type ReportsFilters,
} from "@/lib/reports-contract";
import {
  getReportsOptions,
  getReportsSummary,
  getReportsNorthStar,
  exportReportsPeople,
} from "@/lib/reports.functions";
import {
  REPORTS_DEFINITIONS,
  REPORTS_DEFINITIONS_DATE,
  REPORTS_DEFINITIONS_VERSION,
} from "@/lib/reports-definitions";
import { fmtDate, fmtDateTime } from "@/lib/display-dates";
import { peopleCsv } from "@/lib/reports-download";
import { downloadCsv } from "@/lib/billing-reports";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
const text = (value: string) => fallback(z.string(), value).default(value);
const searchSchema = z.object({
  tab: text("overview"),
  preset: text("30d"),
  compare: text("previous"),
  accounts: text("real"),
  account_type: text("all"),
  agencies: fallback(z.array(z.string()), []).default([]),
  people: fallback(z.array(z.string()), []).default([]),
  talent: text("all"),
  source: text("all"),
  joined: text(""),
  status: text("any"),
  from: text(""),
  to: text(""),
  search: text(""),
  stage: text("all"),
  activity: text("all"),
  type: text(""),
});
export const Route = createFileRoute("/admin/reporting")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Reports · TalVault Admin" },
      {
        name: "description",
        content:
          "Permission-controlled TalVault Reports with shared filters, sign-in activity and downloadable People evidence.",
      },
      { property: "og:title", content: "Reports · TalVault Admin" },
      {
        property: "og:description",
        content: "TalVault registration, sign-in activity and private reporting evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});
function ReportsPage() {
  const search = Route.useSearch(),
    navigate = useNavigate({ from: "/admin/reporting" });
  const parsed = ReportFilters.safeParse(search),
    filters = parsed.success ? parsed.data : reportDefaults;
  const tab = REPORT_TABS.find((t) => t === search.tab) ?? "overview";
  const optionsFn = useServerFn(getReportsOptions),
    summaryFn = useServerFn(getReportsSummary),
    northFn = useServerFn(getReportsNorthStar),
    download = useServerFn(exportReportsPeople);
  const [downloading, setDownloading] = useState(false);
  const options = useQuery({
    queryKey: ["admin", "reports-options"],
    queryFn: () => optionsFn(),
    staleTime: 30000,
  });
  const o = options.data,
    period = o ? reportPeriod(filters, o.as_of, o.launch_date, o.first_date) : null;
  const summary = useQuery({
    queryKey: ["admin", "reports-summary", filters, period, o?.as_of],
    enabled: !!period && !!o && (tab === "overview" || tab === "engagement"),
    queryFn: () => {
      if (!period || !o) throw new Error("Choose a reporting period.");
      return summaryFn({ data: { filters, ...period, asOf: o.as_of } });
    },
  });
  const north = useQuery({
    queryKey: ["admin", "reports-north-star", filters, period, o?.as_of],
    enabled: !!period && !!o && tab === "overview",
    queryFn: () => {
      if (!period || !o) throw new Error("Choose a reporting period.");
      return northFn({ data: { filters, from: period.from, to: period.to, asOf: o.as_of } });
    },
  });
  const change = (next: ReportsFilters) => {
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  };
  const openPeople = (next: Partial<ReportsFilters> = {}) => {
    void navigate({ search: (prev) => ({ ...prev, ...next, tab: "people" }) });
  };
  async function exportPeople() {
    if (!period || !o) return;
    setDownloading(true);
    try {
      const d = await download({
        data: { filters, from: period.from, to: period.to, asOf: o.as_of },
      });
      downloadCsv(
        `talvault-people-${filters.accounts}-${period.from}-${period.to}.csv`,
        peopleCsv(d.rows, false),
      );
    } catch (e) {
      toast.error(friendlyError(e, "The report could not be downloaded."));
    } finally {
      setDownloading(false);
    }
  }
  const signIn =
    period && o ? (
      <SignInActivity
        from={period.from}
        to={period.to}
        accounts={filters.accounts}
        summary={
          summary.data
            ? {
                ...summary.data,
                groups: summary.data.groups.filter(
                  (g) => filters.account_type === "all" || g.type === filters.account_type,
                ),
              }
            : undefined
        }
        isPending={summary.isPending}
        isError={summary.isError}
        retry={() => void summary.refetch()}
        onPeople={(d) => openPeople({ account_type: d.type, activity: d.population, people: [] })}
      />
    ) : null;
  return (
    <div className="min-w-0 reports-foundation">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="tvp-h1">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {REPORTS_DEFINITIONS_VERSION} · {REPORTS_DEFINITIONS_DATE}
            {o ? ` · ${o.role.charAt(0).toUpperCase()}${o.role.slice(1)}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 print:hidden"
          title="Print current Reports view"
          onClick={() => window.print()}
        >
          <Printer />
          Print / Save PDF
        </Button>
      </header>
      {options.isPending && (
        <p role="status" className="text-muted-foreground">
          Checking Reports access…
        </p>
      )}
      {options.isError && (
        <div className="flex flex-wrap gap-3 items-center py-6">
          <p className="text-sm text-muted-foreground">
            Reports access or filters could not be loaded. Ask a Reports Owner to review your
            access, or retry.
          </p>
          <Button variant="outline" onClick={() => void options.refetch()}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      )}
      {o && (
        <>
          <ReportsFilterBar
            filters={filters}
            options={o}
            onChange={change}
            summary={
              <>
                {period
                  ? `${fmtDate(period.from)}–${fmtDate(period.to)} · ${period.prior ? `Compared with ${fmtDate(period.prior.from)}–${fmtDate(period.prior.to)}` : "No comparison"}`
                  : "Choose valid dates"}{" "}
                ·{" "}
                {filters.accounts === "all"
                  ? "All accounts"
                  : `${filters.accounts === "real" ? "Real" : "Test"} accounts`}{" "}
                · South African time · Sign-ins tracked since{" "}
                {fmtDate(o.first_login, "Not recorded")}
              </>
            }
          />
          {!parsed.success && (
            <p className="text-xs text-muted-foreground mb-3">
              Some filters are invalid. Reset filters to choose a valid view.
            </p>
          )}
          <nav
            aria-label="Reports tabs"
            className="flex overflow-x-auto border-b border-border gap-1 mb-5 print:hidden"
          >
            {REPORT_TABS.map((t) => (
              <Button
                key={t}
                variant={tab === t ? "secondary" : "ghost"}
                className="h-11 shrink-0 rounded-none border-b-2 border-transparent aria-[current=page]:border-primary"
                aria-current={tab === t ? "page" : undefined}
                onClick={() => void navigate({ search: (prev) => ({ ...prev, tab: t }) })}
              >
                {REPORT_TAB_LABELS[t]}
              </Button>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
            Recorder installed {fmtDateTime(o.capture_started_at)}; earlier history and rollout
            coverage are incomplete. Missing capture never establishes inactivity. Current agency
            membership, account status and test flags are used where historical changes were not
            recorded.
          </p>
          {!period ? (
            <p className="text-muted-foreground py-8">
              Choose valid reporting dates. Missing launch or first-record dates are not
              substituted.
            </p>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <section className="border-b border-border pb-5 mb-6">
                    <header className="flex flex-wrap justify-between items-center gap-3">
                      <div className="flex items-center">
                        <h2 className="tvp-h2">Two-sided engagement</h2>
                        <ReportDefinition definition="north_star" />
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => openPeople({ people: north.data?.people ?? [] })}
                        disabled={!north.data?.people.length}
                      >
                        View contributing people
                      </Button>
                    </header>
                    {north.isPending && (
                      <p className="text-muted-foreground mt-3">Calculating relationships…</p>
                    )}
                    {north.isError && (
                      <p className="text-muted-foreground mt-3">
                        Two-sided engagement could not be calculated.
                      </p>
                    )}
                    {north.data && (
                      <>
                        <Button
                          variant="link"
                          className="!px-0 h-auto text-2xl font-semibold my-3"
                          disabled={!north.data.people.length}
                          onClick={() => openPeople({ people: north.data.people })}
                        >
                          {north.data.active} of {north.data.total} ·{" "}
                          {north.data.total
                            ? Math.round((north.data.active / north.data.total) * 100)
                            : 0}
                          %
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Live relationships with activity on both sides; a staff sign-in alone
                          never qualifies. Relationship counts are not People-row counts.
                          {north.data.people.length < 5 ? " Small sample." : ""}
                        </p>
                      </>
                    )}
                  </section>
                  {signIn}
                </>
              )}
              {tab === "engagement" && signIn}
              {tab === "people" && (
                <ReportsPeople
                  key={JSON.stringify({ filters, period })}
                  filters={filters}
                  from={period.from}
                  to={period.to}
                  asOf={o.as_of}
                  role={o.role}
                  onChange={change}
                />
              )}
              {tab === "exports" && (
                <section className="py-3">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center">
                      <h2 className="tvp-h2">People · current filters</h2>
                      <ReportDefinition definition="privacy" />
                    </div>
                    <Button
                      disabled={!roleCan(o.role, "download_raw_data") || downloading}
                      onClick={() => void exportPeople()}
                    >
                      <Download />
                      {downloading ? "Preparing…" : "Download CSV"}
                    </Button>
                  </header>
                  <p className="text-xs text-muted-foreground mt-3">
                    Email addresses omitted. All matching rows, not just the visible page. Excel is
                    available in People.
                  </p>
                </section>
              )}
              {tab === "launch" &&
                (o.role === "owner" ? (
                  <LaunchReports from={period.from} to={period.to} />
                ) : (
                  <p className="text-sm text-muted-foreground py-6">
                    Identifiable launch offer and Terms records require Owner access.
                  </p>
                ))}
              {(tab === "growth" || tab === "agencies" || tab === "business") && (
                <section className="py-5">
                  <h2 className="tvp-h2">{REPORT_TAB_LABELS[tab]}</h2>
                  <p className="text-sm text-muted-foreground mt-3">
                    Additional analysis is not yet available.
                  </p>
                  <Button variant="link" className="!px-0 mt-2" onClick={() => openPeople()}>
                    View People with these filters
                  </Button>
                </section>
              )}
            </>
          )}
          <section className="border-t border-border mt-6 pt-5">
            <h2 className="tvp-h2 mb-3">Definitions and data dictionary</h2>
            <p className="text-xs text-muted-foreground mb-3">
              {REPORTS_DEFINITIONS_VERSION} · {REPORTS_DEFINITIONS_DATE}
            </p>
            <dl className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
              {Object.entries(REPORTS_DEFINITIONS).map(([key, d]) => (
                <div key={key}>
                  <dt className="text-sm font-semibold">{d.title}</dt>
                  <dd className="text-xs text-muted-foreground leading-relaxed mt-1">{d.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
