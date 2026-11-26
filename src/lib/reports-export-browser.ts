import { downloadCsv } from "./billing-reports";
export type DownloadTable = { id: string; label: string; rows: object[] };
export function tableMatrix(rows: object[]) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cells = rows.map((row) => {
    const entries = new Map(Object.entries(row));
    return columns.map((key) => {
      const value: unknown = entries.get(key);
      return value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    });
  });
  return { columns, cells };
}
export function matrixCsv(columns: string[], cells: string[][]) {
  const cell = (v: string) => `"${(/^[\s]*[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"`;
  return [columns, ...cells].map((row) => row.map(cell).join(",")).join("\n");
}
export async function downloadReportTables(
  tables: DownloadTable[],
  format: "csv" | "xlsx",
  zip = false,
) {
  if (zip) {
    const { zipSync, strToU8 } = await import("fflate");
    const files: Record<string, Uint8Array> = {};
    for (const table of tables) {
      const { columns, cells } = tableMatrix(table.rows);
      if (format === "csv") files[`${table.id}.csv`] = strToU8(matrixCsv(columns, cells));
      else {
        const { default: writeExcel } = await import("write-excel-file/browser");
        const excelBlob = await writeExcel(
          [columns.map((value) => ({ value })), ...cells.map((r) => r.map((value) => ({ value })))],
          { sheet: table.label.slice(0, 31) },
        ).toBlob();
        files[`${table.id}.xlsx`] = new Uint8Array(await excelBlob.arrayBuffer());
      }
    }
    files["README.txt"] = strToU8(
      "TalVault raw data. South African time. Document metadata only; no file contents. Emails omitted unless explicitly requested with permission. Sign-ins before 14 September 2026 and 15–24 November 2026 are not recorded. Empty files mean no matching records.",
    );
    const bytes = zipSync(files),
      blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "talvault-raw-data.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  for (const table of tables) {
    const { columns, cells } = tableMatrix(table.rows);
    if (format === "csv") downloadCsv(`talvault-${table.id}.csv`, matrixCsv(columns, cells));
    else {
      const { default: writeExcel } = await import("write-excel-file/browser");
      await writeExcel(
        [
          columns.map((value) => ({ value, fontWeight: "bold" as const })),
          ...cells.map((r) => r.map((value) => ({ value }))),
        ],
        { sheet: table.label.slice(0, 31) },
      ).toFile(`talvault-${table.id}.xlsx`);
    }
  }
}
