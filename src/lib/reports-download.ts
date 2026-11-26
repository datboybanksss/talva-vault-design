import { fmtDateTime } from "./display-dates";
import { SIGN_IN_TYPE_LABEL } from "./sign-in-metering";
import { withoutEmails } from "./report-download";
import type { ReportsPerson } from "./reports-contract";
export const PEOPLE_COLUMNS = [
  "Name",
  "Account type",
  "Agency / Independent",
  "Status",
  "Joined",
  "Stage reached",
  "Last sign-in / visit",
  "Days since",
  "Days active",
  "Sign-ins / visits",
  "Average per week",
  "Documents",
  "Launch-discount status",
  "Keep-by date",
];
const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export function peopleCells(p: ReportsPerson, emails = false): (string | number)[] {
  const cells: (string | number)[] = [
    p.name,
    SIGN_IN_TYPE_LABEL[p.account_type],
    p.account_type === "trusted_contact"
      ? "Not applicable"
      : p.agency_names.join(", ") || "Independent",
    sentence(p.status),
    fmtDateTime(p.registered_at, "Not recorded"),
    sentence(p.stage),
    fmtDateTime(p.last_sign_in, "Not recorded"),
    p.days_since_last ?? "Not recorded",
    p.capture_complete || p.active_days > 0 ? p.active_days : "Not tracked",
    p.capture_complete || p.sign_ins > 0 ? p.sign_ins : "Not tracked",
    p.capture_complete ? p.average_per_week : "Not tracked",
    p.documents,
    p.launch_discount_status ?? "Not tracked",
    fmtDateTime(p.keep_by, "Not tracked"),
  ];
  return emails
    ? [...cells, p.email ?? "Not recorded"]
    : cells.map((v) => (typeof v === "string" ? withoutEmails(v) : v));
}
export function peopleCsv(rows: ReportsPerson[], emails: boolean) {
  const cell = (v: unknown) => {
    const text = String(v ?? "");
    const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const columns = emails ? [...PEOPLE_COLUMNS, "Email"] : PEOPLE_COLUMNS;
  return [columns, ...rows.map((p) => peopleCells(p, emails))]
    .map((r) => r.map(cell).join(","))
    .join("\n");
}
