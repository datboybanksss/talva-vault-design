import { useState, type ReactNode } from "react";
import { Copy, Filter, RotateCcw, Save, Trash2, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type ReportsFilters, ReportFilters, reportDefaults } from "@/lib/reports-contract";
import { SIGN_IN_TYPE_LABEL } from "@/lib/sign-in-metering";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteReportView, listReportViews, saveReportView } from "@/lib/reports.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
type Options = {
  agencies: { id: string; name: string; is_test?: boolean }[];
  joined_months: string[];
};
export function ReportsFilterBar({
  filters: f,
  options,
  onChange,
  summary,
}: {
  filters: ReportsFilters;
  options: Options;
  onChange: (f: ReportsFilters) => void;
  summary: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [name, setName] = useState(""),
    [agencySearch, setAgencySearch] = useState("");
  const load = useServerFn(listReportViews),
    save = useServerFn(saveReportView),
    remove = useServerFn(deleteReportView),
    qc = useQueryClient();
  const views = useQuery({ queryKey: ["admin", "report-views"], queryFn: () => load() });
  const saved = useMutation({
    mutationFn: () => save({ data: { name, filters: f } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "report-views"] });
      setSaveOpen(false);
      setName("");
      toast.success("View saved privately.");
    },
    onError: (e) => toast.error(friendlyError(e, "The view could not be saved.")),
  });
  const deleted = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "report-views"] });
      toast.success("Saved view removed.");
    },
    onError: (e) => toast.error(friendlyError(e, "The view could not be removed.")),
  });
  function change(key: keyof ReportsFilters, value: string) {
    const parsed = ReportFilters.safeParse({ ...f, [key]: value });
    if (parsed.success) onChange(parsed.data);
  }
  const active = Object.entries(f).filter(
    ([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(reportDefaults[key as keyof ReportsFilters]),
  ).length;
  function select(
    key: keyof ReportsFilters,
    label: string,
    items: { value: string; label: string }[],
  ) {
    return (
      <label className="min-w-0 text-xs font-medium" key={key}>
        {label}
        <select
          className="mt-1 !w-full !min-w-0 !h-11"
          value={String(f[key])}
          onChange={(e) => change(key, e.target.value)}
        >
          {items.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <section aria-label="Report filters" className="report-filter-card mb-5">
      <div className="report-mobile-filter">
        <Button
          variant="outline"
          className="h-11"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="reports-global-filters"
        >
          <Filter />
          Filters ({active})
        </Button>
        <p className="report-meta">{summary}</p>
      </div>
      <div
        id="reports-global-filters"
        className={`${expanded ? "!grid" : "!hidden"} md:!grid report-filter-fields !gap-3`}
      >
        {select("preset", "Period", [
          { value: "7d", label: "Last 7 days" },
          { value: "30d", label: "Last 30 days" },
          { value: "90d", label: "Last 90 days" },
          { value: "month", label: "This month" },
          { value: "last_month", label: "Last month" },
          { value: "launch", label: "Since launch" },
          { value: "all", label: "All time" },
          { value: "custom", label: "Custom" },
        ])}
        {select("compare", "Compare with", [
          { value: "previous", label: "Previous equal period" },
          { value: "last_month", label: "Same period last month" },
          { value: "none", label: "None" },
        ])}
        <div className="report-filter-label">
          Accounts
          <div className="report-segment" aria-label="Accounts">
            {(["real", "test", "all"] as const).map((scope) => (
              <Button
                key={scope}
                variant="ghost"
                aria-pressed={f.accounts === scope}
                onClick={() => onChange({ ...f, accounts: scope, agencies: [] })}
              >
                {scope === "real" ? "Real" : scope === "test" ? "Test" : "All"}
              </Button>
            ))}
          </div>
        </div>
        {select("account_type", "Account type", [
          { value: "all", label: "All" },
          ...Object.entries(SIGN_IN_TYPE_LABEL).map(([value, label]) => ({ value, label })),
        ])}
        <div className="report-filter-label report-agency-field">
          Agency
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="report-agency-trigger"
                aria-label="Agency filter"
              >
                {f.agencies.length ? `${f.agencies.length} agencies` : "All agencies"}
                <ChevronDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="report-agency-menu" align="start">
              <input
                aria-label="Search agencies"
                placeholder="Search agencies"
                value={agencySearch}
                onChange={(e) => setAgencySearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto">
                {options.agencies
                  .filter((a) => f.accounts === "all" || !!a.is_test === (f.accounts === "test"))
                  .filter((a) => a.name.toLowerCase().includes(agencySearch.toLowerCase()))
                  .map((a) => (
                    <label key={a.id} className="flex items-center gap-3 py-3 text-sm">
                      <Checkbox
                        checked={f.agencies.includes(a.id)}
                        onCheckedChange={(checked) =>
                          onChange({
                            ...f,
                            agencies: checked
                              ? [...f.agencies, a.id]
                              : f.agencies.filter((id) => id !== a.id),
                          })
                        }
                      />
                      {a.name}
                    </label>
                  ))}
              </div>
              <Button variant="ghost" onClick={() => onChange({ ...f, agencies: [] })}>
                All agencies
              </Button>
            </PopoverContent>
          </Popover>
        </div>
        {select("talent", "Talent", [
          { value: "all", label: "All" },
          { value: "agency_linked", label: "Agency-linked" },
          { value: "independent", label: "Independent" },
        ])}
        {select("source", "Invitation source", [
          { value: "all", label: "All" },
          { value: "admin", label: "TalVault admin" },
          { value: "agency", label: "Agency" },
          { value: "waiting_list", label: "Waiting list" },
          { value: "launch_signup_sheet", label: "Launch sign-up sheet" },
        ])}
        {select("joined", "Joined (month)", [
          { value: "", label: "Any month" },
          ...options.joined_months.map((m) => ({
            value: m,
            label: new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-ZA", {
              month: "long",
              year: "numeric",
            }),
          })),
        ])}
        {select("status", "Account status", [
          { value: "any", label: "Any" },
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "suspended", label: "Suspended" },
        ])}
        {f.preset === "custom" && (
          <>
            <label className="text-xs font-medium">
              From
              <input
                type="date"
                className="mt-1 !h-11 !w-full"
                value={f.from}
                max={f.to || undefined}
                onChange={(e) => onChange({ ...f, from: e.target.value })}
              />
            </label>
            <label className="text-xs font-medium">
              To
              <input
                type="date"
                className="mt-1 !h-11 !w-full"
                value={f.to}
                min={f.from || undefined}
                onChange={(e) => onChange({ ...f, to: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <footer className="report-filter-footer">
        <p className="report-meta report-desktop-summary">{summary}</p>
        <div className="report-filter-actions">
          <Button variant="ghost" onClick={() => onChange(reportDefaults)}>
            <RotateCcw />
            Reset filters
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(window.location.href).then(
                () => toast.success("View link copied."),
                () => toast.error("The link could not be copied. Please try again."),
              )
            }
          >
            <Copy />
            Copy link to this view
          </Button>
          <Button variant="outline" onClick={() => setSaveOpen(true)}>
            <Save />
            Save view
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                Saved views
                <ChevronDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end">
              <p className="text-sm font-semibold mb-2">Private saved views</p>
              {!views.data?.length && (
                <p className="text-sm text-muted-foreground">No saved views yet.</p>
              )}
              {views.data?.map((v) => (
                <div key={v.id} className="flex gap-2 items-center">
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start truncate"
                    onClick={() => onChange(v.filters)}
                  >
                    {v.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${v.name}`}
                    disabled={deleted.isPending}
                    onClick={() => deleted.mutate(v.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </footer>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogTitle>Save private view</DialogTitle>
          <label className="tvp-form-group">
            Name
            <input
              value={name}
              maxLength={80}
              className="!w-full mt-2"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button disabled={!name.trim() || saved.isPending} onClick={() => saved.mutate()}>
            <Save />
            {saved.isPending ? "Saving…" : "Save view"}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
