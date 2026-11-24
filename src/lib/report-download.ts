/** Raw exports omit email columns and embedded addresses by default. */
export function withoutEmails(value: unknown): string {
  return String(value ?? "").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email omitted]");
}
export function csvCell(value: unknown): string {
  const text = withoutEmails(value);
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function privateReportCsv(columns: string[], rows: unknown[][]): string {
  const indices = columns
    .map((label, i) => ({ label, i }))
    .filter(({ label }) => !/email/i.test(label));
  return [
    indices.map(({ label }) => csvCell(label)).join(","),
    ...rows.map((row) => indices.map(({ i }) => csvCell(row[i])).join(",")),
  ].join("\n");
}
/** Read every bounded page; abort instead of delivering a partial or changed export. */
export async function allReportRows<T>(
  fetchPage: (offset: number) => Promise<{ total: number; rows: T[] }>,
): Promise<T[]> {
  const result: T[] = [];
  let expected: number | undefined;
  for (;;) {
    const page = await fetchPage(result.length);
    expected ??= page.total;
    if (page.total !== expected || (page.rows.length === 0 && result.length < expected))
      throw new Error("The report changed while it was being downloaded. Please try again.");
    result.push(...page.rows);
    if (result.length === expected) return result;
    if (result.length > expected)
      throw new Error("The report changed while it was being downloaded. Please try again.");
  }
}
