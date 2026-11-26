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
import { LaunchReports } from "@/components/admin/launch-reports";
import { ReportsDataExports } from "@/components/admin/reports-data-exports";
import {
  OverviewPanels,
  GrowthPanels,
  EngagementPanels,
  AgencyPanels,
  BusinessPanels,
  ReportActionsProvider,
  type ReportActions,
} from "@/components/admin/reports-analytics-panels";
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
  getReportsNorthStar,
  exportReportsEvidence,
} from "@/lib/reports.functions";
import {
  getReportsAnalytics,
  exportHistoricalReport,
  exportReportSection,
  exportInvestorPack,
} from "@/lib/reports-analytics.functions";
import { DATASETS, type SectionId } from "@/lib/reports-analytics";
import { downloadReportTables } from "@/lib/reports-export-browser";
import {
  REPORTS_DEFINITIONS,
  REPORTS_DEFINITIONS_DATE,
  REPORTS_DEFINITIONS_VERSION,
} from "@/lib/reports-definitions";
import { fmtDate } from "@/lib/display-dates";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { useSessionReady } from "@/hooks/use-session-ready";
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
  drill: text(""),
});
export const Route = createFileRoute("/admin/reporting")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Reports · TalVault Admin" },
      {
        name: "description",
        content:
          "Permission-controlled TalVault Reports with shared filters, sign-in activity and downloadable People records.",
      },
      { property: "og:title", content: "Reports · TalVault Admin" },
      {
        property: "og:description",
        content: "TalVault registration, sign-in activity and private reporting data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});
function ReportsPage() {
  const sessionReady = useSessionReady(),
    search = Route.useSearch(),
    navigate = useNavigate({ from: "/admin/reporting" });
  const parsed = ReportFilters.safeParse(search),
    filters = parsed.success ? parsed.data : reportDefaults,
    tab = REPORT_TABS.find((t) => t === search.tab) ?? "overview";
  const optionsFn = useServerFn(getReportsOptions),
    analyticsFn = useServerFn(getReportsAnalytics),
    northFn = useServerFn(getReportsNorthStar),
    exportFn = useServerFn(exportHistoricalReport),
    sectionFn = useServerFn(exportReportSection),
    evidenceFn = useServerFn(exportReportsEvidence),
    investorFn = useServerFn(exportInvestorPack);
  const [busy, setBusy] = useState(false),
    [fullHistory, setFullHistory] = useState(false);
  const options = useQuery({
    queryKey: ["admin", "reports-options"],
    queryFn: () => optionsFn(),
    enabled: sessionReady,
    retry: false,
    staleTime: 30000,
  });
  const o = options.data,
    period = o ? reportPeriod(filters, o.as_of, o.launch_date, o.first_date) : null;
  // People-list refinements (a drill-down, search, stage, activity) never narrow the sections.
  const sectionFilters = {
    ...filters,
    people: [],
    search: "",
    stage: "all" as const,
    activity: "all" as const,
  };
  const analyticsFilters =
    tab === "business"
      ? { ...sectionFilters, accounts: "real" as const }
      : tab === "exports" && fullHistory
        ? { ...reportDefaults, accounts: "all" as const }
        : sectionFilters;
  const from = tab === "exports" && fullHistory ? (o?.first_date ?? period?.from) : period?.from;
  const input =
    period && o && from
      ? {
          filters: analyticsFilters,
          from,
          to: period.to,
          prior: period.prior,
          asOf: o.as_of,
          firstDate: o.first_date ?? from,
        }
      : null;
  const analytics = useQuery({
    queryKey: ["admin", "reports-historical-analytics", input],
    enabled: sessionReady && !!input,
    queryFn: () => {
      if (!input) throw new Error("Choose valid reporting dates.");
      return analyticsFn({ data: input });
    },
    retry: false,
  });
  const north = useQuery({
    queryKey: ["admin", "reports-north-star", sectionFilters, period, o?.as_of],
    enabled: sessionReady && !!period && !!o && tab === "overview",
    queryFn: () => {
      if (!period || !o) throw new Error("Choose valid reporting dates.");
      return northFn({
        data: { filters: sectionFilters, from: period.from, to: period.to, asOf: o.as_of },
      });
    },
  });
  const previousNorth = useQuery({
    queryKey: ["admin", "reports-north-star-prior", sectionFilters, period?.prior, o?.as_of],
    enabled: sessionReady && !!period?.prior && !!o && tab === "overview",
    queryFn: () => {
      if (!period?.prior || !o) throw new Error("Choose a comparison period.");
      return northFn({ data: { filters: sectionFilters, ...period.prior, asOf: o.as_of } });
    },
  });
  function change(next: ReportsFilters) {
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  }
  function openTab(next: (typeof REPORT_TABS)[number]) {
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: next,
        // A drill-down belongs to People only; leaving it restores the full list.
        ...(next === "people" ? {} : { people: [], drill: "" }),
      }),
    });
  }
  function openPeople(ids: string[], label: string) {
    const people = [...new Set(ids)];
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: "people",
        people: people.length ? people : ["no-matching-people"],
        drill: label,
        // Business always reports real accounts, so its people are opened in that scope.
        accounts: tab === "business" ? "real" : prev.accounts,
        stage: "all",
        activity: "all",
        search: "",
      }),
    });
  }
  async function run(task: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await task();
      toast.success("Report downloaded.");
    } catch (e) {
      toast.error(friendlyError(e, failure));
    } finally {
      setBusy(false);
    }
  }
  function download(
    dataset: string,
    format: "csv" | "xlsx",
    includeEmails: boolean,
    full: boolean,
  ) {
    if (!input) return;
    void run(async () => {
      const tables = await exportFn({
        data: { ...input, dataset, includeEmails, fullHistory: full },
      });
      await downloadReportTables(tables, format, dataset === "all");
    }, "The report could not be downloaded.");
  }
  function downloadSection(section: SectionId | "north_star") {
    if (!input || !period) return;
    void run(async () => {
      if (section === "north_star") {
        const evidence = await evidenceFn({
          data: {
            filters: sectionFilters,
            from: period.from,
            to: period.to,
            asOf: input.asOf,
            dataset: "relationships",
          },
        });
        const rows = evidence.rows.map((row) =>
          Object.fromEntries(evidence.columns.map((column, i) => [column, row[i] ?? ""])),
        );
        await downloadReportTables(
          [{ id: "two-sided-engagement", label: "Two-sided engagement", rows }],
          "csv",
        );
        return;
      }
      const table = await sectionFn({ data: { ...input, section } });
      await downloadReportTables([table], "csv");
    }, "This section could not be downloaded.");
  }
  function downloadInvestorPack() {
    if (!o?.first_date) return;
    const firstDate = o.first_date;
    void run(async () => {
      const [pack, { buildInvestorPack }] = await Promise.all([
        investorFn({ data: { firstDate, asOf: o.as_of } }),
        import("@/lib/reports-investor-pack"),
      ]);
      await buildInvestorPack(pack, {
        version: REPORTS_DEFINITIONS_VERSION,
        date: REPORTS_DEFINITIONS_DATE,
        definitions: Object.values(REPORTS_DEFINITIONS),
        datasets: DATASETS.map((d) => ({ label: d.label, unit: d.unit, includes: d.includes })),
      });
    }, "The investor pack could not be created.");
  }
  const scope =
    filters.accounts === "all"
      ? "all accounts"
      : filters.accounts === "test"
        ? "test accounts"
        : "real accounts";
  const data = analytics.data,
    canDownload = !!o && roleCan(o.role, "download_raw_data") && !busy;
  const actions: ReportActions = {
    onPeople: openPeople,
    onDownload: downloadSection,
    onTab: openTab,
    onInvestorPack: downloadInvestorPack,
    canDownload,
    canManageSpend: !!o && roleCan(o.role, "manage_spend"),
  };
  const panel = data ? { data } : null;
  return (
    <div className="reports-foundation">
      <header className="report-page-head">
        <div>
          <h1>Reports</h1>
          <p className="mt-1">
            How TalVault is performing, for {scope}
            {filters.accounts === "real" ? " unless you change the filter." : "."}
          </p>
        </div>
        <div className="report-header-right">
          <p className="report-meta">
            {o
              ? `Data refreshed today, ${new Date(o.as_of).toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })}`
              : "Loading latest data…"}
          </p>
          <div>
            <Button variant="outline" onClick={() => openTab("exports")}>
              <Download />
              Download raw data
            </Button>
            <Button onClick={() => window.print()}>
              <Printer />
              Print or save PDF
            </Button>
          </div>
        </div>
      </header>
      {options.isPending && (
        <p role="status" className="report-meta">
          Checking Reports access…
        </p>
      )}
      {options.isError && (
        <div className="flex flex-wrap gap-3 py-6">
          <p>Reports could not be opened. Please retry.</p>
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
                  ? `${fmtDate(period.from)} – ${fmtDate(period.to)}${period.prior ? ` vs ${fmtDate(period.prior.from)} – ${fmtDate(period.prior.to)}` : ""}`
                  : "Choose valid dates"}{" "}
                · {scope.charAt(0).toUpperCase() + scope.slice(1)} · South African time · Sign-ins
                recorded since {fmtDate(o.first_login)}
              </>
            }
          />
          <nav className="report-tabs" aria-label="Reports tabs">
            {REPORT_TABS.map((t) => (
              <Button
                key={t}
                variant="ghost"
                aria-current={tab === t ? "page" : undefined}
                onClick={() => openTab(t)}
              >
                {REPORT_TAB_LABELS[t]}
              </Button>
            ))}
          </nav>
          {!period ? (
            <p>Choose valid reporting dates.</p>
          ) : (
            <ReportActionsProvider value={actions}>
              {analytics.isPending && tab !== "people" && tab !== "launch" && (
                <p role="status" className="report-meta py-8">
                  Loading historical figures…
                </p>
              )}
              {analytics.isError && tab !== "people" && tab !== "launch" && (
                <div className="flex flex-wrap gap-3 py-6">
                  <p>Historical figures could not be loaded.</p>
                  <Button variant="outline" onClick={() => void analytics.refetch()}>
                    <RefreshCw />
                    Retry
                  </Button>
                </div>
              )}
              {panel && tab === "overview" && (
                <OverviewPanels
                  {...panel}
                  {...(north.data ? { north: north.data } : {})}
                  {...(previousNorth.data ? { previousNorth: previousNorth.data } : {})}
                />
              )}
              {panel && tab === "growth" && <GrowthPanels {...panel} />}
              {panel && tab === "engagement" && <EngagementPanels {...panel} />}
              {panel && tab === "agencies" && <AgencyPanels {...panel} />}
              {tab === "people" && (
                <ReportsPeople
                  key={JSON.stringify({ filters, period })}
                  filters={filters}
                  from={period.from}
                  to={period.to}
                  asOf={o.as_of}
                  role={o.role}
                  onChange={change}
                  drill={search.drill}
                  onClearDrill={() =>
                    void navigate({ search: (prev) => ({ ...prev, people: [], drill: "" }) })
                  }
                />
              )}
              {panel && tab === "business" && <BusinessPanels {...panel} />}
              {data && tab === "exports" && (
                <ReportsDataExports
                  role={o.role}
                  counts={data.dataset_counts}
                  busy={busy}
                  onFullHistory={setFullHistory}
                  onDownload={download}
                />
              )}
              {tab === "launch" && (
                <LaunchReports
                  from={period.from}
                  to={period.to}
                  filters={filters}
                  role={o.role}
                  asOf={o.as_of}
                />
              )}
            </ReportActionsProvider>
          )}
          <section className="report-definitions" id="report-definitions">
            <h2>Definitions and data dictionary</h2>
            <p className="report-meta my-3">
              {REPORTS_DEFINITIONS_VERSION} · {REPORTS_DEFINITIONS_DATE}
            </p>
            <dl className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
              {Object.entries(REPORTS_DEFINITIONS).map(([key, d]) => (
                <div key={key}>
                  <dt className="font-semibold">{d.title}</dt>
                  <dd className="report-meta mt-1">{d.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
