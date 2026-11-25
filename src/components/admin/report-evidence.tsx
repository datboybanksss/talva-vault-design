import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getReportsEvidence, exportReportsEvidence } from "@/lib/reports.functions";
import { roleCan, type ReportsFilters, type ReportRole } from "@/lib/reports-contract";
import { privateReportCsv } from "@/lib/report-download";
import { downloadCsv } from "@/lib/billing-reports";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export function ReportEvidence({
  dataset,
  filters,
  from,
  to,
  asOf,
  role,
}: {
  dataset: "sign_in_events" | "relationships";
  filters: ReportsFilters;
  from: string;
  to: string;
  asOf: string;
  role: ReportRole;
}) {
  const [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false);
  const load = useServerFn(getReportsEvidence),
    exportAll = useServerFn(exportReportsEvidence);
  const input = { dataset, filters, from, to, asOf };
  const q = useQuery({
    queryKey: ["admin", "reports-evidence", input, offset],
    enabled: open,
    queryFn: () => load({ data: { ...input, offset } }),
  });
  async function download() {
    setBusy(true);
    try {
      const d = await exportAll({ data: input });
      downloadCsv(
        `talvault-${dataset}-${filters.accounts}-${from}-${to}.csv`,
        privateReportCsv(d.columns, d.rows),
      );
    } catch (e) {
      toast.error(friendlyError(e, "The evidence could not be downloaded."));
    } finally {
      setBusy(false);
    }
  }
  const title =
    dataset === "relationships" ? "Relationship evidence" : "Sign-in and visit evidence";
  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <List />
          View raw records
        </Button>
        <Button
          variant="outline"
          disabled={busy || !roleCan(role, "download_raw_data")}
          title={
            roleCan(role, "download_raw_data")
              ? "Download all matching records, without emails"
              : "Your Reports role does not allow downloads"
          }
          onClick={() => void download()}
        >
          <Download />
          {busy ? "Preparing…" : "Download CSV"}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85dvh] overflow-y-auto min-w-0">
          <DialogTitle>{title}</DialogTitle>
          {q.isPending && <p role="status">Loading evidence…</p>}
          {q.isError && (
            <p className="text-sm text-muted-foreground">
              Evidence could not be loaded.{" "}
              <Button variant="link" onClick={() => void q.refetch()}>
                Retry
              </Button>
            </p>
          )}
          {q.data && (
            <>
              <p className="text-xs text-muted-foreground">
                {q.data.total} matching records · Emails omitted · Same filters and cut-off as the
                section.
              </p>
              <div className="max-w-full overflow-x-auto">
                <table className="tvp-table min-w-[900px]">
                  <thead>
                    <tr>
                      {q.data.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td
                            key={j}
                            className="!whitespace-normal break-words min-w-32 !px-3 !py-2"
                          >
                            {c ?? "Not recorded"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!q.data.total && <p>No matching records.</p>}
              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 25))}
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + 25 >= q.data.total}
                  onClick={() => setOffset(offset + 25)}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
