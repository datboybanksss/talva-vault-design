import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FileSpreadsheet,
  Mail,
  RefreshCw,
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
};
export function ReportsPeople({ filters: f, from, to, asOf, role, onChange }: Props) {
  const [offset, setOffset] = useState(0),
    [sort, setSort] = useState<
      | "name"
      | "sign_ins"
      | "active_days"
      | "registered_at"
      | "last_sign_in"
      | "documents"
      | "stage"
      | "status"
    >("name"),
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
  return (
    <section aria-label="People report" className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center">
          <h2 className="tvp-h2">People</h2>
          <ReportDefinition definition="registered" />
          <ReportDefinition definition="onboarded" />
        </div>
        <div className="flex gap-1">
          <Button variant="outline" className="h-11" onClick={() => setChooser(true)}>
            <Columns3 />
            Columns
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            title="Download CSV"
            aria-label="Download People CSV"
            disabled={!q.data || busy || !roleCan(role, "download_raw_data")}
            onClick={() => void download("csv")}
          >
            <Download />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            title="Download Excel"
            aria-label="Download People Excel"
            disabled={!q.data || busy || !roleCan(role, "download_raw_data")}
            onClick={() => void download("xlsx")}
          >
            <FileSpreadsheet />
          </Button>
        </div>
      </header>
      <div className="!grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 !gap-3 tvp-form-group mb-4">
        <label className="text-xs font-medium">
          Search name
          <input
            className="mt-1 !h-11 !w-full"
            value={f.search}
            onChange={(e) => {
              onChange({ ...f, search: e.target.value });
              setOffset(0);
            }}
          />
        </label>
        <label className="text-xs font-medium">
          Stage
          <select
            className="mt-1 !h-11 !w-full"
            value={f.stage}
            onChange={(e) => change("stage", e.target.value)}
          >
            <option value="all">All stages</option>
            <option value="invited">Invited</option>
            <option value="registered">Registered</option>
            <option value="onboarded">Onboarded</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Activity
          <select
            className="mt-1 !h-11 !w-full"
            value={f.activity}
            onChange={(e) => change("activity", e.target.value)}
          >
            <option value="all">All, including no activity</option>
            <option value="active">Active</option>
            <option value="returning">Returning</option>
            <option value="dormant">Dormant (complete capture)</option>
            <option value="never">Never signed in (complete capture)</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Sort by
          <select
            className="mt-1 !h-11 !w-full"
            value={sort}
            onChange={(e) => {
              const v = e.target.value;
              if (
                v === "name" ||
                v === "sign_ins" ||
                v === "active_days" ||
                v === "registered_at" ||
                v === "last_sign_in" ||
                v === "documents" ||
                v === "stage" ||
                v === "status"
              ) {
                setSort(v);
                setOffset(0);
              }
            }}
          >
            <option value="name">Name</option>
            <option value="sign_ins">Sign-ins / visits</option>
            <option value="active_days">Days active</option>
            <option value="registered_at">Joined</option>
            <option value="last_sign_in">Last sign-in / visit</option>
            <option value="documents">Documents</option>
            <option value="stage">Stage</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Order
          <select
            className="mt-1 !h-11 !w-full"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value === "desc" ? "desc" : "asc");
              setOffset(0);
            }}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex gap-2 items-center text-sm min-h-11">
            <Checkbox
              checked={selection.all}
              onCheckedChange={(v) => setSelection({ all: v === true, ids: new Set() })}
            />
            Select all {total} matching people
          </label>
          <Button variant="outline" disabled title="Messaging is not available yet">
            <Mail />
            Message {count} people
          </Button>
        </div>
        {roleCan(role, "include_email_addresses") && (
          <label className="flex gap-2 items-center text-sm min-h-11">
            <Checkbox checked={emails} onCheckedChange={(v) => setEmails(v === true)} />
            Include email addresses
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        {total} people · {q.data?.registered ?? "—"} registered · {count} selected. Emails are
        omitted unless explicitly included with permission. Recorded activity in incomplete periods
        is a lower bound, not proof of inactivity. Document counts are currently recorded validated
        own uploads in the period; the onboarding milestone survives deletion. Launch discount and
        message history are Not tracked.
      </p>
      {q.isPending && (
        <p role="status" className="text-sm text-muted-foreground py-8">
          Loading people…
        </p>
      )}
      {q.isError && (
        <div className="flex flex-wrap gap-3 items-center py-5">
          <p className="text-sm text-muted-foreground">The People report could not be loaded.</p>
          <Button variant="outline" onClick={() => void q.refetch()}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      )}
      {q.data && (
        <>
          <div className="overflow-x-auto w-full border border-border rounded-md">
            <table className="tvp-table !mb-0 min-w-[1100px]">
              <thead>
                <tr>
                  <th className="!w-12">Select</th>
                  {columns.map((i) => (
                    <th key={i}>{PEOPLE_COLUMNS[i]}</th>
                  ))}
                  {input.includeEmails && <th>Email</th>}
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((p) => (
                  <tr key={p.person_id}>
                    <td>
                      <Checkbox
                        aria-label={`Select ${p.name}`}
                        checked={checked(p.person_id)}
                        onCheckedChange={() => toggle(p.person_id)}
                      />
                    </td>
                    {columns.map((i) => (
                      <td key={i} className="!whitespace-normal min-w-28 max-w-64 break-words">
                        {i === 0 ? (
                          <Button
                            variant="link"
                            className="!px-0 h-auto !whitespace-normal text-left"
                            onClick={() => setPerson(p)}
                          >
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
              </tbody>
            </table>
          </div>
          {total === 0 && (
            <p className="text-sm text-muted-foreground py-8">No people match these filters.</p>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-xs text-muted-foreground">
              Showing {total ? offset + 1 : 0}–{offset + q.data.rows.length} of {total}
              {total < 5 ? " · Small sample" : ""}
            </p>
            <div className="flex gap-2">
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
          Messages received: Not tracked.
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
