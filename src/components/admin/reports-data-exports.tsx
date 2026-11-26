import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DATASETS } from "@/lib/reports-analytics";
import { roleCan, type ReportRole } from "@/lib/reports-contract";
import { listReportDownloads } from "@/lib/reports-analytics.functions";
import { fmtDateTime } from "@/lib/display-dates";
import { ReportDefinition } from "./report-definition";
export function ReportsDataExports({
  role,
  counts,
  onDownload,
  busy,
  onFullHistory,
}: {
  role: ReportRole;
  counts: Record<string, number>;
  busy: boolean;
  onFullHistory: (full: boolean) => void;
  onDownload: (dataset: string, format: "csv" | "xlsx", emails: boolean, full: boolean) => void;
}) {
  const [full, setFull] = useState(false),
    [format, setFormat] = useState<"csv" | "xlsx">("csv"),
    [emails, setEmails] = useState(false),
    load = useServerFn(listReportDownloads),
    history = useQuery({ queryKey: ["admin", "reports-downloads", busy], queryFn: () => load() });
  return (
    <>
      <section className="report-card">
        <header className="report-section-head">
          <div>
            <h2>Data exports</h2>
            <p className="report-meta">
              Complete matching rows, not only the current page. Documents contain metadata only.
            </p>
          </div>
          <ReportDefinition definition="privacy" />
        </header>
        <div className="report-chart-controls">
          <div className="report-segment report-local-segment">
            <Button
              variant="ghost"
              aria-pressed={!full}
              onClick={() => {
                setFull(false);
                onFullHistory(false);
              }}
            >
              Use current filters
            </Button>
            <Button
              variant="ghost"
              aria-pressed={full}
              onClick={() => {
                setFull(true);
                onFullHistory(true);
              }}
            >
              Full history, all accounts
            </Button>
          </div>
          <label>
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value === "xlsx" ? "xlsx" : "csv")}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">Excel</option>
            </select>
          </label>
          {roleCan(role, "include_email_addresses") && (
            <label className="flex gap-2 items-center">
              <Checkbox checked={emails} onCheckedChange={(v) => setEmails(v === true)} />
              Include email addresses
            </label>
          )}
        </div>
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>One row per</th>
                <th>Includes</th>
                <th>Rows</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {DATASETS.map((d) => (
                <tr key={d.id}>
                  <td>{d.label}</td>
                  <td>{d.unit}</td>
                  <td>{d.includes}</td>
                  <td>{counts[d.id] ?? "—"}</td>
                  <td>
                    <Button
                      variant="outline"
                      disabled={busy || !roleCan(role, "download_raw_data")}
                      onClick={() => onDownload(d.id, format, emails, full)}
                      aria-label={`Download ${d.label}`}
                    >
                      <Download />
                      {format === "csv" ? "CSV" : "Excel"}
                    </Button>
                  </td>
                </tr>
              ))}
              <tr>
                <td>Messages sent</td>
                <td colSpan={4}>Available when messaging launches</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer className="report-export-footer">
          <Button
            variant="outline"
            disabled={busy || !roleCan(role, "download_raw_data")}
            onClick={() => onDownload("all", format, emails, full)}
          >
            <FileArchive />
            {busy ? "Preparing download…" : "Download everything (ZIP)"}
          </Button>
          <Button
            variant="link"
            onClick={() =>
              document.getElementById("report-definitions")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Data dictionary
          </Button>
        </footer>
        <p className="report-meta">
          Email addresses are omitted by default. Every download is recorded.
        </p>
      </section>
      <section className="report-card">
        <header className="report-section-head">
          <div>
            <h2>Download history</h2>
            <p className="report-meta">Your latest recorded downloads.</p>
          </div>
        </header>
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Downloaded</th>
                <th>Dataset</th>
                <th>Rows</th>
                <th>Email addresses</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{r.dataset}</td>
                  <td>{r.row_count}</td>
                  <td>{r.email_included ? "Included" : "Omitted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!history.data?.length && <p className="report-meta">No downloads recorded yet.</p>}
      </section>
    </>
  );
}
