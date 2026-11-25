import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LaunchReports } from "@/components/admin/launch-reports";
import { reportPeriod, reportDefaults } from "@/lib/reports-contract";
import { useState } from "react";
import { fmtDate } from "@/lib/display-dates";

const searchSchema = z.object({
  type: z.enum(["all", "agency", "talent"]).catch("all").default("all"),
  talent: z.enum(["all", "agency_linked", "independent"]).catch("all").default("all"),
  accounts: z.enum(["real", "test", "all"]).catch("real").default("real"),
});
export const Route = createFileRoute("/admin/launch-reports")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Launch records · TalVault Admin" },
      {
        name: "description",
        content: "Existing TalVault launch settings, offer records and Terms administration.",
      },
      { property: "og:title", content: "Launch records · TalVault Admin" },
      {
        property: "og:description",
        content: "TalVault launch administration under existing administrator permissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchAdministration,
});
function LaunchAdministration() {
  const search = Route.useSearch(),
    navigate = Route.useNavigate();
  const [periodFilters, setPeriodFilters] = useState(reportDefaults);
  const period = reportPeriod(periodFilters, new Date().toISOString(), null, null);
  return (
    <section className="min-w-0">
      <h1 className="tvp-h1 mb-4">Launch records</h1>
      <div className="tvp-form-group !flex !flex-row flex-wrap items-end !gap-3 my-4">
        <label>
          From
          <input
            type="date"
            aria-label="Launch from"
            value={periodFilters.from || period?.from || ""}
            onChange={(e) =>
              setPeriodFilters({
                ...periodFilters,
                preset: "custom",
                from: e.target.value,
                to: periodFilters.to || period?.to || "",
              })
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            aria-label="Launch to"
            value={periodFilters.to || period?.to || ""}
            onChange={(e) =>
              setPeriodFilters({
                ...periodFilters,
                preset: "custom",
                to: e.target.value,
                from: periodFilters.from || period?.from || "",
              })
            }
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {period
            ? `${fmtDate(period.from)}–${fmtDate(period.to)} · South African time`
            : "Choose valid dates"}
        </p>
      </div>
      {period && (
        <LaunchReports
          from={period.from}
          to={period.to}
          legacy={{
            type: search.type,
            segment: search.talent,
            accounts: search.accounts,
            onClear: () => {
              void navigate({ search: { type: "all", talent: "all", accounts: "real" } });
            },
            onChange: (key, value) => {
              void navigate({ search: (prev) => searchSchema.parse({ ...prev, [key]: value }) });
            },
          }}
        />
      )}
    </section>
  );
}
