import { z } from "zod";
import { fmtDate, fmtDateTime } from "./display-dates";
import { SHARE_RECIPIENT_TERM_PLURAL_CAPITALISED } from "./terms";
import { ACCOUNT_SCOPE_REPORT_LABEL } from "./report-scope";

export const SIGN_IN_TYPES = ["agency_staff", "talent", "trusted_contact"] as const;
export const SIGN_IN_TYPE_LABEL = {
  agency_staff: "Agency staff",
  talent: "Talent",
  trusted_contact: SHARE_RECIPIENT_TERM_PLURAL_CAPITALISED,
};
export const SIGN_IN_SORTS = [
  "name",
  "account_type",
  "agency",
  "sign_ins",
  "active_days",
  "average_per_week",
  "first_sign_in",
  "last_sign_in",
  "days_since_last",
] as const;
export type SignInType = (typeof SIGN_IN_TYPES)[number];
export type SignInPopulation = "all" | "active" | "returning" | "dormant";
export type SignInSort = (typeof SIGN_IN_SORTS)[number];
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const n = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(n.getTime()) && n.toISOString().slice(0, 10) === s;
  }, "Please choose a valid date.");
const periodFields = {
  from: date,
  to: date,
  accounts: z.enum(["real", "test", "all"]).default("real"),
  asOf: z.string().datetime({ offset: true }).optional(),
};
export const SignInPeriodInput = z
  .object(periodFields)
  .refine((p) => p.from <= p.to, "Please choose a valid reporting period.");
export const SignInPageInput = z
  .object({
    ...periodFields,
    type: z.enum(["all", ...SIGN_IN_TYPES]).default("all"),
    population: z.enum(["all", "active", "returning", "dormant"]).default("all"),
    agency: z.string().uuid().optional(),
    sort: z.enum(SIGN_IN_SORTS).default("sign_ins"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(200).default(25),
    offset: z.number().int().min(0).default(0),
  })
  .refine((p) => p.from <= p.to, "Please choose a valid reporting period.");
export type SignInPageRequest = z.input<typeof SignInPageInput>;
const stats = z.object({
  total: z.number(),
  active: z.number(),
  returning: z.number(),
  sign_ins: z.number(),
  average_days: z.number(),
  dormant: z.number(),
});
export const SignInSummarySchema = z.object({
  groups: z.array(
    z.object({
      type: z.enum(SIGN_IN_TYPES),
      current: stats,
      prior: stats,
      tracking_since: z.string().nullable(),
    }),
  ),
  unconfirmed_talent: z.number(),
  missing_registration_dates: z.number().default(0),
  comparison_enabled: z.boolean().default(true),
  unresolved_logins: z.number(),
  capture_started_at: z.string(),
  as_of: z.string(),
  prior: z.object({ from: z.string(), to: z.string() }),
});
export const SignInPersonSchema = z.object({
  person_id: z.string(),
  name: z.string(),
  account_type: z.enum(SIGN_IN_TYPES),
  agency_ids: z.array(z.string()),
  agency_names: z.array(z.string()),
  onboarded_at: z.string().nullable(),
  sign_ins: z.number(),
  active_days: z.number(),
  average_per_week: z.number(),
  first_sign_in: z.string().nullable(),
  last_sign_in: z.string().nullable(),
  days_since_last: z.number().nullable(),
  dormant: z.boolean().nullable(),
});
export const SignInPageSchema = z.object({
  total: z.number(),
  rows: z.array(SignInPersonSchema),
  as_of: z.string(),
  agencies: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type SignInSummary = z.infer<typeof SignInSummarySchema>;
export type SignInGroup = SignInSummary["groups"][number];
export type SignInPerson = z.infer<typeof SignInPersonSchema>;
export type SignInPage = z.infer<typeof SignInPageSchema>;

export function sastDay(value: string): string {
  return new Date(new Date(value).getTime() + 2 * 3600000).toISOString().slice(0, 10);
}
export function signInCoverage(
  from: string,
  to: string,
  summary: SignInSummary,
  group: SignInGroup,
) {
  const cutoff = to < sastDay(summary.as_of) ? to : sastDay(summary.as_of);
  const first = group.tracking_since
    ? sastDay(group.tracking_since)
    : sastDay(summary.capture_started_at);
  const available = cutoff >= first && from <= cutoff;
  const complete = new Date(`${from}T00:00:00+02:00`) >= new Date(summary.capture_started_at);
  const dormantKnown =
    (new Date(`${cutoff}T00:00:00Z`).getTime() -
      new Date(`${sastDay(summary.capture_started_at)}T00:00:00Z`).getTime()) /
      86400000 >=
    30;
  return { available, complete, dormantKnown, cutoff };
}
export function signInColumns(type: "all" | SignInType): string[] {
  const action =
    type === "trusted_contact" ? "visit" : type === "all" ? "sign-in / visit" : "sign-in";
  return [
    "Name",
    "Type",
    "Agency / Independent",
    `${action === "visit" ? "Visits" : type === "all" ? "Sign-ins / visits" : "Sign-ins"} in period`,
    "Days active",
    `${type === "trusted_contact" ? "Visits" : type === "all" ? "Sign-ins / visits" : "Sign-ins"} per week`,
    `First ${action}`,
    `Last ${action}`,
    `Days since last ${action}`,
  ];
}
export function signInCells(p: SignInPerson): (string | number)[] {
  return [
    p.name,
    SIGN_IN_TYPE_LABEL[p.account_type],
    p.account_type === "trusted_contact" ? "—" : p.agency_names.join(", ") || "Independent",
    p.sign_ins,
    p.active_days,
    p.average_per_week,
    fmtDateTime(p.first_sign_in, "Not recorded"),
    fmtDateTime(p.last_sign_in, "Not recorded"),
    p.days_since_last ?? "Not recorded",
  ];
}
export function signInSnapshotRows(
  d: SignInSummary,
  from: string,
  to: string,
): (string | number)[][] {
  return d.groups.flatMap((g) => {
    const coverage = signInCoverage(from, to, d, g);
    const value = (n: number) => (coverage.available ? n : "Not recorded");
    const prior = signInCoverage(d.prior.from, d.prior.to, d, g);
    const unit = g.type === "trusted_contact" ? "visits" : "sign-ins";
    return [
      [
        `${SIGN_IN_TYPE_LABEL[g.type]}: active`,
        value(g.current.active),
        `of ${g.current.total} ${g.type === "trusted_contact" ? "recipients given access" : "registered users"}`,
      ],
      [
        `${SIGN_IN_TYPE_LABEL[g.type]}: returning`,
        value(g.current.returning),
        "Active on 2+ South African days",
      ],
      [
        `${SIGN_IN_TYPE_LABEL[g.type]}: ${unit}`,
        value(g.current.sign_ins),
        prior.available && coverage.complete && prior.complete
          ? `${g.prior.sign_ins} in prior period`
          : "Prior comparison unavailable: incomplete history",
      ],
      [
        `${SIGN_IN_TYPE_LABEL[g.type]}: average days active`,
        value(g.current.average_days),
        "Per active person",
      ],
      [
        `${SIGN_IN_TYPE_LABEL[g.type]}: dormant`,
        coverage.dormantKnown ? g.current.dormant : "Not yet available",
        "30+ days without a recorded sign-in / visit",
      ],
    ];
  });
}
export function signInContext(
  d: SignInSummary,
  accounts: "real" | "test" | "all",
  from: string,
  to: string,
): string {
  return `${ACCOUNT_SCOPE_REPORT_LABEL[accounts]} · ${fmtDate(from)}–${fmtDate(to)} · As of ${fmtDateTime(d.as_of)} · Recorder installed ${fmtDateTime(d.capture_started_at)}; earlier history and rollout coverage are incomplete. ${d.missing_registration_dates} registered people have no recorded registration date; they remain included without proxy dates. ${d.unresolved_logins} unresolved login rows are excluded.`;
}
