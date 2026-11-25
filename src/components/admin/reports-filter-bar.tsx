import { useState, type ReactNode } from "react";
import { Copy, Filter, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type ReportsFilters, ReportFilters, reportDefaults } from "@/lib/reports-contract";
import { SIGN_IN_TYPE_LABEL } from "@/lib/sign-in-metering";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteReportView, listReportViews, saveReportView } from "@/lib/reports.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
type Options = { agencies: { id: string; name: string }[]; joined_months: string[] };
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
    [name, setName] = useState("");
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
    <section
      aria-label="Report filters"
      className="sticky top-0 z-20 bg-background border-b border-border py-3 mb-5"
    >
      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
        <Button
          variant="outline"
          className="md:hidden h-11"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="reports-global-filters"
        >
          <Filter />
          Filters ({active})
        </Button>
        <p className="text-xs text-muted-foreground leading-relaxed flex-1 min-w-48">{summary}</p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            title="Reset filters"
            aria-label="Reset filters"
            onClick={() => onChange(reportDefaults)}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            title="Copy link to this view"
            aria-label="Copy link to this view"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(
                () => toast.success("View link copied."),
                () => toast.error("The link could not be copied. Please try again."),
              );
            }}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            title="Save view"
            aria-label="Save view"
            onClick={() => setSaveOpen(true)}
          >
            <Save />
          </Button>
        </div>
      </div>
      <div
        id="reports-global-filters"
        className={`${expanded ? "!grid" : "!hidden"} md:!grid grid-cols-1 min-[430px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 !gap-3 tvp-form-group`}
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
        {select("accounts", "Accounts", [
          { value: "real", label: "Real" },
          { value: "test", label: "Test" },
          { value: "all", label: "All" },
        ])}
        {select("account_type", "Account type", [
          { value: "all", label: "All" },
          ...Object.entries(SIGN_IN_TYPE_LABEL).map(([value, label]) => ({ value, label })),
        ])}
        <label className="min-w-0 text-xs font-medium">
          Agency
          <select
            multiple
            aria-label="Agency multi-select"
            className="!w-full !min-w-0 !h-24 mt-1"
            value={f.agencies}
            onChange={(e) =>
              onChange({ ...f, agencies: Array.from(e.target.selectedOptions, (o) => o.value) })
            }
          >
            {options.agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {f.agencies.length > 0 && (
            <Button
              variant="link"
              className="!px-0 text-xs"
              onClick={() => onChange({ ...f, agencies: [] })}
            >
              All agencies
            </Button>
          )}
        </label>
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
        <div className="min-w-0">
          <label className="text-xs font-medium">
            Saved views
            <select
              className="!w-full !min-w-0 !h-11 mt-1"
              value=""
              onChange={(e) => {
                const view = views.data?.find((v) => v.id === e.target.value);
                if (view) onChange(view.filters);
              }}
            >
              <option value="">Choose a private view</option>
              {views.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {views.data?.map((v) => (
            <div className="flex items-center justify-between gap-2 text-xs" key={v.id}>
              <span className="truncate">{v.name}</span>
              <Button
                variant="ghost"
                size="icon"
                title={`Remove ${v.name}`}
                aria-label={`Remove ${v.name}`}
                onClick={() => deleted.mutate(v.id)}
                disabled={deleted.isPending}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
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
