import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download, FileDown, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessibleModal } from "@/components/shared/accessible-modal";
import { getSignInProfiles } from "@/lib/sign-in-metering.functions";
import {
  signInCells,
  signInColumns,
  SIGN_IN_TYPES,
  SIGN_IN_TYPE_LABEL,
  SIGN_IN_SORTS,
  type SignInPopulation,
  type SignInSort,
  type SignInType,
  type SignInPerson,
} from "@/lib/sign-in-metering";
import { allReportRows, privateReportCsv, withoutEmails } from "@/lib/report-download";
import {
  downloadCsv,
  printHtmlDocument,
  escapeHtml,
  PRINT_DOC_STYLES,
} from "@/lib/billing-reports";
import { ACCOUNT_SCOPE_REPORT_LABEL, type AccountScope } from "@/lib/report-scope";
import { fmtDate, fmtDateTime } from "@/lib/display-dates";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export type SignInDrill = { type: "all" | SignInType; population: SignInPopulation; title: string };
const PAGE = 25;
export function SignInProfileDrawer({
  initial,
  from,
  to,
  accounts,
  asOf,
  note,
  onClose,
}: {
  initial: SignInDrill;
  from: string;
  to: string;
  accounts: AccountScope;
  asOf: string;
  note: string;
  onClose: () => void;
}) {
  const [type, setType] = useState(initial.type);
  const [population, setPopulation] = useState(initial.population);
  const [agency, setAgency] = useState("");
  const [sort, setSort] = useState<SignInSort>("sign_ins");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const load = useServerFn(getSignInProfiles);
  const input = {
    from,
    to,
    accounts,
    asOf,
    type,
    population,
    sort,
    direction,
    ...(agency ? { agency } : {}),
  };
  const q = useQuery({
    queryKey: ["admin", "sign-in-profiles", input, offset],
    queryFn: () => load({ data: { ...input, limit: PAGE, offset } }),
  });
  const columns = signInColumns(type);
  const total = q.data?.total ?? 0;
  const reset = () => setOffset(0);
  async function download(format: "csv" | "pdf") {
    setExporting(true);
    try {
      const people = await allReportRows<SignInPerson>((next) =>
        load({ data: { ...input, limit: 200, offset: next } }),
      );
      const rows = people.map(signInCells);
      const context = `${ACCOUNT_SCOPE_REPORT_LABEL[accounts]} · ${fmtDate(from)}–${fmtDate(to)} · As of ${fmtDateTime(asOf)} · ${initial.title} · ${note}`;
      if (format === "csv")
        downloadCsv(
          `talvault-sign-ins-${accounts}-${from}-${to}.csv`,
          privateReportCsv(columns, rows),
        );
      else
        printHtmlDocument(
          `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in activity · TalVault</title><style>${PRINT_DOC_STYLES}</style></head><body><h1>Sign-in activity</h1><p class="meta">${escapeHtml(withoutEmails(context))}</p><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(withoutEmails(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`,
        );
    } catch (e) {
      toast.error(friendlyError(e, "This report could not be downloaded. Please try again."));
    } finally {
      setExporting(false);
    }
  }
  return (
    <AccessibleModal onClose={onClose} label={initial.title}>
      <div className="tvp-modal-backdrop flex justify-end">
        <section className="tvp-card !rounded-none w-full max-w-6xl h-dvh overflow-y-auto !p-4 sm:!p-6">
          <header className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="tvp-h2 break-words">{initial.title}</h2>
              <p className="tvp-muted text-sm mt-1">
                {fmtDate(from)}–{fmtDate(to)} · {ACCOUNT_SCOPE_REPORT_LABEL[accounts]}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                title="Download all filtered rows as CSV"
                aria-label="Download all filtered rows as CSV"
                disabled={!q.data || exporting}
                onClick={() => void download("csv")}
              >
                <Download />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                title="Print all filtered rows or save PDF"
                aria-label="Print all filtered rows or save PDF"
                disabled={!q.data || exporting}
                onClick={() => void download("pdf")}
              >
                <FileDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                title="Close report"
                aria-label="Close report"
                onClick={onClose}
              >
                <X />
              </Button>
            </div>
          </header>
          <p className="tvp-muted text-xs mb-4 leading-relaxed">
            {note} Email addresses are omitted from downloads. First and last dates use recorded
            history up to {fmtDateTime(asOf)}.
          </p>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-3 mb-5 tvp-form-group">
            <label className="min-w-0 text-sm">
              Type
              <select
                className="!w-full !min-w-0 !h-11"
                value={type}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "all" || SIGN_IN_TYPES.some((t) => t === value)) {
                    setType(value as typeof type);
                    setAgency("");
                    reset();
                  }
                }}
              >
                <option value="all">All types</option>
                {SIGN_IN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SIGN_IN_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm">
              People
              <select
                className="!w-full !min-w-0 !h-11"
                value={population}
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "all" ||
                    value === "active" ||
                    value === "returning" ||
                    value === "dormant"
                  ) {
                    setPopulation(value);
                    reset();
                  }
                }}
              >
                <option value="all">All, including no activity</option>
                <option value="active">Active</option>
                <option value="returning">Returning</option>
                <option value="dormant">Dormant (recorded history)</option>
              </select>
            </label>
            <label className="min-w-0 text-sm">
              Agency
              <select
                className="!w-full !min-w-0 !h-11"
                value={agency}
                disabled={type === "trusted_contact"}
                onChange={(e) => {
                  setAgency(e.target.value);
                  reset();
                }}
              >
                <option value="">All agencies / Independent</option>
                {q.data?.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm">
              Sort by
              <select
                className="!w-full !min-w-0 !h-11"
                value={sort}
                onChange={(e) => {
                  const value = SIGN_IN_SORTS.find((s) => s === e.target.value);
                  if (value) {
                    setSort(value);
                    reset();
                  }
                }}
              >
                {SIGN_IN_SORTS.map((s, i) => (
                  <option key={s} value={s}>
                    {columns[i]}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm">
              Order
              <select
                className="!w-full !min-w-0 !h-11"
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value === "asc" ? "asc" : "desc");
                  reset();
                }}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>
          {q.isPending && (
            <p className="tvp-muted" role="status">
              Loading people…
            </p>
          )}
          {q.isError && (
            <div className="flex items-center gap-3">
              <p className="tvp-muted">These records could not be loaded.</p>
              <Button variant="outline" onClick={() => void q.refetch()}>
                <RefreshCw />
                Retry
              </Button>
            </div>
          )}
          {q.data && (
            <>
              <p className="tvp-muted text-sm mb-3" aria-live="polite">
                {exporting
                  ? "Preparing all filtered rows…"
                  : `${total} ${total === 1 ? "person" : "people"} · Showing ${total ? offset + 1 : 0}–${offset + q.data.rows.length}`}
              </p>
              {total === 0 && <p className="tvp-muted py-5">No people match these filters.</p>}
              <div className="hidden md:block tvp-table-wrap">
                <table className="tvp-table">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c} className="!whitespace-normal">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.rows.map((p) => (
                      <tr key={p.person_id}>
                        {signInCells(p).map((v, i) => (
                          <td key={columns[i]} className="!whitespace-normal break-words">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden">
                {q.data.rows.map((p) => (
                  <article key={p.person_id} className="border-b border-border py-4">
                    <h3 className="font-semibold break-words">{p.name}</h3>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm mt-3">
                      {signInCells(p)
                        .slice(1)
                        .map((v, i) => (
                          <div key={columns[i + 1]} className="min-w-0">
                            <dt className="tvp-muted text-xs break-words">{columns[i + 1]}</dt>
                            <dd className="break-words mt-1">{v}</dd>
                          </div>
                        ))}
                    </dl>
                  </article>
                ))}
              </div>
              <footer className="flex items-center justify-between gap-3 mt-5">
                <p className="tvp-muted text-xs">
                  {Math.ceil(total / PAGE)} {Math.ceil(total / PAGE) === 1 ? "page" : "pages"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE))}
                  >
                    <ChevronLeft />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={offset + PAGE >= total}
                    onClick={() => setOffset(offset + PAGE)}
                  >
                    Next
                    <ChevronRight />
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </AccessibleModal>
  );
}
