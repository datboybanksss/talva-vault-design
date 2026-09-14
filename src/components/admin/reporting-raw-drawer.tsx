import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Download } from "lucide-react";
import { getReportingRawRows, type ReportingMetric } from "@/lib/admin-reporting.functions";

const PAGE = 25;

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * One drawer for every summary card: the metric name maps to its underlying
 * query, so each card shows the rows behind the number rather than the number
 * again.
 */
export function ReportingRawDrawer({
  metric,
  title,
  from,
  to,
  onClose,
}: {
  metric: ReportingMetric;
  title: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const rawFn = useServerFn(getReportingRawRows);

  const q = useQuery({
    queryKey: ["admin", "reporting", "raw", metric, from, to, offset],
    queryFn: () =>
      rawFn({ data: { metric, from, to, limit: PAGE, offset } }) as Promise<{
        total: number;
        columns: string[];
        rows: unknown[][];
        note?: string;
      }>,
  });

  const data = q.data;
  const total = data?.total ?? 0;
  const shown = data?.rows.length ?? 0;

  function exportCsv() {
    if (!data) return;
    const lines = [
      data.columns.map(csvCell).join(","),
      ...data.rows.map((r) => r.map(csvCell).join(",")),
    ];
    download(`talvault-${metric}-${from}-to-${to}.csv`, lines.join("\n"));
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
        display: "flex", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        className="tvp-card"
        style={{
          width: "min(880px, 96vw)", height: "100%", borderRadius: 0, padding: 24,
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
          <h2 className="tvp-h2">{title}</h2>
          <div className="flex gap-2">
            <button className="tvp-secondary" onClick={exportCsv} disabled={!data || shown === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button className="tvp-mini-btn" title="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="tvp-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {from} to {to} · {total} row{total === 1 ? "" : "s"}
        </p>

        {data?.note && (
          <p className="tvp-muted" style={{ fontSize: 12, marginBottom: 12 }}>{data.note}</p>
        )}

        {q.isLoading && <div className="tvp-muted">Loading rows…</div>}
        {q.isError && (
          <div className="tvp-muted">These rows could not be loaded. Try again shortly.</div>
        )}

        {data && (
          <>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={data.columns.length} className="tvp-muted" style={{ padding: 20 }}>
                        No records in this period.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>
                          {typeof c === "string" && /^\d{4}-\d{2}-\d{2}T/.test(c)
                            ? new Date(c).toLocaleString("en-ZA")
                            : String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > PAGE && (
              <div className="flex justify-between items-center" style={{ marginTop: 12 }}>
                <span className="tvp-muted" style={{ fontSize: 12 }}>
                  Showing {shown === 0 ? 0 : offset + 1}–{offset + shown} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    className="tvp-secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE))}
                  >
                    Previous
                  </button>
                  <button
                    className="tvp-secondary"
                    disabled={offset + PAGE >= total}
                    onClick={() => setOffset(offset + PAGE)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
