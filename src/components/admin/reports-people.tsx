import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FileSpreadsheet,
  Mail,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getReportsPeople, getReportsTimeline, exportReportsPeople } from "@/lib/reports.functions";
import { PEOPLE_COLUMNS, peopleCells, peopleCsv } from "@/lib/reports-download";
import {
  roleCan,
  type ReportsFilters,
  type ReportsPerson,
  type ReportRole,
} from "@/lib/reports-contract";
import { fmtDateTime } from "@/lib/display-dates";
import { downloadCsv } from "@/lib/billing-reports";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { ReportDefinition } from "./report-definition";
type Props = {
  filters: ReportsFilters;
  from: string;
  to: string;
  asOf: string;
  role: ReportRole;
  onChange: (f: ReportsFilters) => void;
  /** The figure this list was opened from, when it was opened from a figure. */
  drill?: string;
  onClearDrill?: () => void;
};
type SortKey =
  | "name"
  | "sign_ins"
  | "active_days"
  | "registered_at"
  | "last_sign_in"
  | "documents"
  | "stage"
  | "status";
/** Sortable People columns, by their position in PEOPLE_COLUMNS. */
const SORT_BY_COLUMN: Partial<Record<number, SortKey>> = {
  0: "name",
  3: "status",
  4: "registered_at",
  5: "stage",
  6: "last_sign_in",
  8: "active_days",
  9: "sign_ins",
  11: "documents",
};
const STAGE_LABEL: Record<string, string> = {
  invited: "Invited",
  registered: "Registered",
  onboarded: "Onboarded",
  returned: "Returned",
};
const ACTIVITY_LABEL: Record<string, string> = {
  active: "Active",
  returning: "Returning",
  dormant: "Dormant",
  never: "Never signed in",
};
export function ReportsPeople({
  filters: f,
  from,
  to,
  asOf,
  role,
  onChange,
  drill = "",
  onClearDrill,
}: Props) {
  const [offset, setOffset] = useState(0),
    [sort, setSort] = useState<SortKey>("name"),
    [direction, setDirection] = useState<"asc" | "desc">("asc"),
    [emails, setEmails] = useState(false),
    [busy, setBusy] = useState(false),
    [chooser, setChooser] = useState(false),
    [columns, setColumns] = useState(() => PEOPLE_COLUMNS.map((_, i) => i)),
    [person, setPerson] = useState<ReportsPerson | null>(null),
    [selection, setSelection] = useState<{ all: boolean; ids: Set<string> }>({
      all: false,
      ids: new Set(),
    });
  const load = useServerFn(getReportsPeople),
    exportAll = useServerFn(exportReportsPeople);
  const input = {
    from,
    to,
    asOf,
    filters: f,
    includeEmails: emails && roleCan(role, "include_email_addresses"),
    sort,
    direction,
  };
  const q = useQuery({
    queryKey: ["admin", "reports-people", input, offset],
    queryFn: () => load({ data: { ...input, offset } }),
  });
  const total = q.data?.total ?? 0,
    count = selection.all ? Math.max(0, total - selection.ids.size) : selection.ids.size;
  const checked = (id: string) => (selection.all ? !selection.ids.has(id) : selection.ids.has(id));
  function toggle(id: string) {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setSelection({ ...selection, ids });
  }
  async function download(format: "csv" | "xlsx") {
    setBusy(true);
    try {
      const data = await exportAll({ data: input }),
        file = `talvault-people-${f.accounts}-${from}-to-${to}`;
      if (format === "csv") downloadCsv(`${file}.csv`, peopleCsv(data.rows, input.includeEmails));
      else {
        const { default: writeExcel } = await import("write-excel-file/browser");
        const headers = input.includeEmails ? [...PEOPLE_COLUMNS, "Email"] : PEOPLE_COLUMNS;
        await writeExcel(
          [
            headers.map((value) => ({ value, fontWeight: "bold" as const })),
            ...data.rows.map((p) =>
              peopleCells(p, input.includeEmails).map((value) => ({ value })),
            ),
          ],
          { sheet: "People" },
        ).toFile(`${file}.xlsx`);
      }
      toast.success(`${data.rows.length} people downloaded.`);
    } catch (e) {
      toast.error(friendlyError(e, "The People report could not be downloaded."));
    } finally {
      setBusy(false);
    }
  }
  function change(key: "stage" | "activity", value: string) {
    const choices =
      key === "stage"
        ? ["all", "invited", "registered", "onboarded", "returned"]
        : ["all", "active", "returning", "dormant", "never"];
    if (choices.includes(value)) {
      onChange({ ...f, [key]: value });
      setOffset(0);
    }
  }
  const canDownload = !!q.data && !busy && roleCan(role, "download_raw_data");
  const chips = [
    ...(f.stage !== "all"
      ? [{ key: "stage" as const, text: `Stage: ${STAGE_LABEL[f.stage] ?? f.stage}` }]
      : []),
    ...(f.activity !== "all"
      ? [
          {
            key: "activity" as const,
            text: `Activity: ${ACTIVITY_LABEL[f.activity] ?? f.activity}`,
          },
        ]
      : []),
    ...(f.search ? [{ key: "search" as const, text: `Name contains “${f.search}”` }] : []),
  ];
  return (
    <section aria-label="People report" className="report-card report-people">
      <header className="report-section-head">
        <div>
          <h2>People</h2>
          <p className="report-meta">
            Everyone behind the figures, with their details. Email addresses are left out unless you
            include them.
          </p>
        </div>
        <div className="report-head-actions">
          <ReportDefinition definition="registered" />
          <ReportDefinition definition="onboarded" />
        </div>
      </header>
      <div className="report-people-controls">
        <label className="report-people-search">
          <span>Search</span>
          <span className="report-search-field">
            <Search aria-hidden="true" />
            <input
              value={f.search}
              placeholder="Search by name"
              onChange={(e) => {
                onChange({ ...f, search: e.target.value });
                setOffset(0);
              }}
            />
          </span>
        </label>
        <label>
          <span>Onboarding stage</span>
          <select value={f.stage} onChange={(e) => change("stage", e.target.value)}>
            <option value="all">All stages</option>
            <option value="invited">Invited</option>
            <option value="registered">Registered</option>
            <option value="onboarded">Onboarded</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <label>
          <span>Activity</span>
          <select value={f.activity} onChange={(e) => change("activity", e.target.value)}>
            <option value="all">All activity</option>
            <option value="active">Active</option>
            <option value="returning">Returning</option>
            <option value="dormant">Dormant</option>
            <option value="never">Never signed in</option>
          </select>
        </label>
        <Button variant="outline" onClick={() => setChooser(true)}>
          <Columns3 />
          Columns
        </Button>
      </div>
      {(drill || chips.length > 0) && (
        <div className="report-chips">
          {drill && (
            <Button
              variant="outline"
              className="report-chip report-chip-drill"
              aria-label="Show everyone again"
              onClick={onClearDrill}
            >
              People behind: {drill}
              <X />
            </Button>
          )}
          {chips.map((chip) => (
            <Button
              key={chip.key}
              variant="outline"
              className="report-chip"
              aria-label={`Remove filter: ${chip.text}`}
              onClick={() => onChange({ ...f, [chip.key]: chip.key === "search" ? "" : "all" })}
            >
              {chip.text}
              <X />
            </Button>
          ))}
        </div>
      )}
      {q.isPending && (
        <p role="status" className="report-meta py-8">
          Loading people…
        </p>
      )}
      {q.isError && (
        <div className="flex flex-wrap gap-3 items-center py-5">
          <p className="report-meta">The People report could not be loaded.</p>
          <Button variant="outline" onClick={() => void q.refetch()}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      )}
      {q.data && (
        <>
          <div className="report-table-scroll">
            <table className="report-people-table">
              <thead>
                <tr>
                  <th className="report-select-cell">
                    <Checkbox
                      aria-label={`Select all ${total} matching people`}
                      checked={selection.all}
                      onCheckedChange={(v) => setSelection({ all: v === true, ids: new Set() })}
                    />
                  </th>
                  {columns.map((i) => {
                    const key = SORT_BY_COLUMN[i];
                    return (
                      <th
                        key={i}
                        aria-sort={
                          key && sort === key
                            ? direction === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        {key ? (
                          <Button
                            variant="ghost"
                            className="report-sort"
                            onClick={() => {
                              setDirection(sort === key && direction === "asc" ? "desc" : "asc");
                              setSort(key);
                              setOffset(0);
                            }}
                          >
                            {PEOPLE_COLUMNS[i]}
                            {sort === key && (direction === "asc" ? <ArrowUp /> : <ArrowDown />)}
                          </Button>
                        ) : (
                          PEOPLE_COLUMNS[i]
                        )}
                      </th>
                    );
                  })}
                  {input.includeEmails && <th>Email</th>}
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((p) => (
                  <tr key={p.person_id}>
                    <td className="report-select-cell">
                      <Checkbox
                        aria-label={`Select ${p.name}`}
                        checked={checked(p.person_id)}
                        onCheckedChange={() => toggle(p.person_id)}
                      />
                    </td>
                    {columns.map((i) => (
                      <td key={i}>
                        {i === 0 ? (
                          <Button variant="link" onClick={() => setPerson(p)}>
                            {peopleCells(p, input.includeEmails)[i]}
                          </Button>
                        ) : (
                          peopleCells(p, input.includeEmails)[i]
                        )}
                      </td>
                    ))}
                    {input.includeEmails && (
                      <td className="break-all">{p.email ?? "Not recorded"}</td>
                    )}
                  </tr>
                ))}
                {total === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1 + (input.includeEmails ? 1 : 0)}>
                      No people match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="report-people-footer">
            <div className="report-people-paging">
              <p className="report-meta" data-people-total={total}>
                Showing {total ? offset + 1 : 0}–{offset + q.data.rows.length} of {total}
                {" · "}
                {q.data.registered} registered
                {total > 0 && total < 5 ? " · Small sample" : ""}
              </p>
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              >
                <ChevronLeft />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={offset + 25 >= total}
                onClick={() => setOffset(offset + 25)}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
            <div className="report-people-downloads">
              {roleCan(role, "include_email_addresses") && (
                <label className="report-check">
                  <Checkbox checked={emails} onCheckedChange={(v) => setEmails(v === true)} />
                  Include email addresses
                </label>
              )}
              <Button
                variant="outline"
                disabled
                title="Available when messaging launches"
                aria-label={`Message ${count} people — available when messaging launches`}
              >
                <Mail />
                Message {count} selected
              </Button>
              <Button
                variant="outline"
                disabled={!canDownload}
                onClick={() => void download("csv")}
              >
                <Download />
                Download CSV
              </Button>
              <Button
                variant="outline"
                disabled={!canDownload}
                onClick={() => void download("xlsx")}
              >
                <FileSpreadsheet />
                Download Excel
              </Button>
            </div>
          </footer>
        </>
      )}
      <Dialog open={chooser} onOpenChange={setChooser}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>People columns</DialogTitle>
          {PEOPLE_COLUMNS.map((c, i) => (
            <label key={c} className="flex items-center gap-3 min-h-11 text-sm">
              <Checkbox
                checked={columns.includes(i)}
                disabled={i === 0}
                onCheckedChange={(v) =>
                  setColumns(
                    v ? [...columns, i].sort((a, b) => a - b) : columns.filter((n) => n !== i),
                  )
                }
              />
              {c}
            </label>
          ))}
        </DialogContent>
      </Dialog>
      {person && (
        <PersonTimeline
          {...{ filters: f, from, to, asOf, role, onChange }}
          person={person}
          onClose={() => setPerson(null)}
        />
      )}
    </section>
  );
}
function PersonTimeline({
  person,
  filters,
  from,
  to,
  asOf,
  onClose,
}: Props & { person: ReportsPerson; onClose: () => void }) {
  const [offset, setOffset] = useState(0),
    load = useServerFn(getReportsTimeline);
  const q = useQuery({
    queryKey: ["admin", "reports-timeline", person.person_id, filters, from, to, asOf, offset],
    queryFn: () => load({ data: { personId: person.person_id, filters, from, to, asOf, offset } }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogTitle>{person.name}</DialogTitle>
        <p className="text-xs text-muted-foreground">
          Timeline up to {fmtDateTime(asOf)}. Missing registration dates are not substituted.
          Messages are available when messaging launches.
        </p>
        {q.isPending && <p role="status">Loading timeline…</p>}
        {q.isError && (
          <p className="text-sm text-muted-foreground">The timeline could not be loaded.</p>
        )}
        <ol className="divide-y divide-border">
          {q.data?.rows.map((e, i) => (
            <li key={`${e.id}-${i}`} className="py-3">
              <p className="text-sm font-medium">{e.label}</p>
              <time className="text-xs text-muted-foreground">{fmtDateTime(e.occurred_at)}</time>
            </li>
          ))}
        </ol>
        {q.data && q.data.total === 0 && (
          <p className="text-sm text-muted-foreground">No recorded events.</p>
        )}
        <div className="flex justify-between">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!q.data || offset + 50 >= q.data.total}
            onClick={() => setOffset(offset + 50)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
