import { z } from "zod";
import { sastDay } from "./sign-in-metering";
export const REPORT_TABS = [
  "overview",
  "growth",
  "engagement",
  "agencies",
  "people",
  "business",
  "exports",
  "launch",
] as const;
export const REPORT_TAB_LABELS = {
  overview: "Overview",
  growth: "Growth",
  engagement: "Engagement",
  agencies: "Agencies",
  people: "People",
  business: "Business",
  exports: "Data exports",
  launch: "Launch admin",
};
export const REPORT_ROLES = ["owner", "operations", "analyst", "viewer"] as const;
export const REPORT_ROLE_LABELS = {
  owner: "Owner",
  operations: "Operations",
  analyst: "Analyst",
  viewer: "Viewer",
};
export const REPORT_PERMISSIONS = [
  "view_reports",
  "download_raw_data",
  "include_email_addresses",
  "send_messages",
  "approve_large_sends",
  "manage_spend",
  "manage_access",
] as const;
export type ReportPermission = (typeof REPORT_PERMISSIONS)[number];
export type ReportRole = (typeof REPORT_ROLES)[number];
export function roleCan(role: ReportRole, permission: ReportPermission) {
  if (role === "owner") return true;
  if (permission === "view_reports") return true;
  if (permission === "download_raw_data") return role === "operations" || role === "analyst";
  return (
    (permission === "send_messages" ||
      permission === "approve_large_sends" ||
      permission === "manage_spend") &&
    role === "operations"
  );
}
export const ReportFilters = z.object({
  preset: z
    .enum(["7d", "30d", "90d", "month", "last_month", "launch", "all", "custom"])
    .default("30d"),
  compare: z.enum(["previous", "last_month", "none"]).default("previous"),
  accounts: z.enum(["real", "test", "all"]).default("real"),
  account_type: z.enum(["all", "agency_staff", "talent", "trusted_contact"]).default("all"),
  agencies: z.array(z.string().uuid()).max(200).default([]),
  talent: z.enum(["all", "agency_linked", "independent"]).default("all"),
  source: z.enum(["all", "admin", "agency", "waiting_list", "launch_signup_sheet"]).default("all"),
  joined: z
    .string()
    .regex(/^(\d{4}-\d{2})?$/)
    .default(""),
  status: z.enum(["any", "active", "paused", "suspended"]).default("any"),
  from: z.string().default(""),
  to: z.string().default(""),
  search: z.string().trim().max(200).default(""),
  stage: z.enum(["all", "invited", "registered", "onboarded", "returned"]).default("all"),
  activity: z.enum(["all", "active", "returning", "dormant", "never"]).default("all"),
  people: z.array(z.string().max(100)).max(1000).default([]),
});
export type ReportsFilters = z.infer<typeof ReportFilters>;
export const reportDefaults = ReportFilters.parse({});
function dayMove(day: string, days: number) {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function monthMove(day: string, months: number) {
  const date = new Date(`${day}T12:00:00Z`),
    original = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(original, end));
  return date.toISOString().slice(0, 10);
}
export function reportPeriod(
  f: ReportsFilters,
  now: string,
  launchDate: string | null,
  firstDate: string | null,
) {
  const today = sastDay(now);
  let from = today,
    to = today;
  if (f.preset === "custom") {
    from = f.from;
    to = f.to;
  } else if (f.preset === "month") from = `${today.slice(0, 7)}-01`;
  else if (f.preset === "last_month") {
    to = dayMove(`${today.slice(0, 7)}-01`, -1);
    from = `${to.slice(0, 7)}-01`;
  } else if (f.preset === "launch") from = launchDate ?? "";
  else if (f.preset === "all") from = firstDate ?? "";
  else from = dayMove(today, -(f.preset === "7d" ? 6 : f.preset === "90d" ? 89 : 29));
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(`${s}T12:00:00Z`);
      return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
    });
  if (!date.safeParse(from).success || !date.safeParse(to).success || from > to) return null;
  const days =
    Math.round(
      (new Date(`${to}T12:00Z`).getTime() - new Date(`${from}T12:00Z`).getTime()) / 86400000,
    ) + 1;
  const prior =
    f.compare === "none" || f.preset === "all"
      ? null
      : f.compare === "last_month"
        ? { from: monthMove(from, -1), to: monthMove(to, -1) }
        : { from: dayMove(from, -days), to: dayMove(from, -1) };
  return { from, to, prior };
}
export const ReportPerson = z.object({
  person_id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  account_type: z.enum(["agency_staff", "talent", "trusted_contact"]),
  agency_ids: z.array(z.string()),
  agency_names: z.array(z.string()),
  status: z.string(),
  registered: z.boolean(),
  registered_at: z.string().nullable(),
  onboarded_at: z.string().nullable(),
  stage: z.string(),
  source: z.string().nullable(),
  sign_ins: z.number(),
  active_days: z.number(),
  average_per_week: z.number(),
  first_sign_in: z.string().nullable(),
  last_sign_in: z.string().nullable(),
  days_since_last: z.number().nullable(),
  dormant: z.boolean().nullable(),
  documents: z.number(),
  capture_complete: z.boolean(),
  launch_discount_status: z.string().nullable(),
  keep_by: z.string().nullable(),
});
export type ReportsPerson = z.infer<typeof ReportPerson>;
export const ReportPage = z.object({
  total: z.number(),
  registered: z.number(),
  rows: z.array(ReportPerson),
  as_of: z.string(),
});
export const ReportsInput = z
  .object({
    filters: ReportFilters,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    asOf: z.string().datetime({ offset: true }).optional(),
    includeEmails: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(25),
    offset: z.number().int().nonnegative().default(0),
    sort: z
      .enum([
        "name",
        "sign_ins",
        "active_days",
        "registered_at",
        "last_sign_in",
        "documents",
        "stage",
        "status",
      ])
      .default("name"),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .refine((d) => d.from <= d.to, "Please choose a valid reporting period.");
