import type { ReportsPerson, ReportsFilters } from "./reports-contract";
import { withoutEmails } from "./report-download";

/** The shared roster is filtered in SQL before any Launch record is matched. */
export function launchRosterScope(people: ReportsPerson[], filters: ReportsFilters) {
  const users = new Set(people.map((p) => p.person_id));
  const emails = new Set(people.map((p) => p.email?.trim().toLowerCase()).filter(Boolean));
  const agencies = new Set(people.flatMap((p) => p.agency_ids));
  return {
    users,
    keepInvitation: (i: { email: string; type: "agency" | "talent"; agency_id?: string | null }) =>
      filters.account_type !== "trusted_contact" &&
      (filters.account_type === "all" ||
        (filters.account_type === "agency_staff" ? i.type === "agency" : i.type === "talent")) &&
      (emails.has(i.email.trim().toLowerCase()) ||
        (i.type === "agency" && !!i.agency_id && agencies.has(i.agency_id))),
  };
}

/** Keep response types while removing email fields and embedded addresses before transport. */
export function redactReportEmails<T>(value: T): T {
  if (typeof value === "string") return withoutEmails(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => redactReportEmails(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /email/i.test(key) ? "" : redactReportEmails(entry),
      ]),
    ) as T;
  }
  return value;
}
