import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  ReportFilters,
  ReportPage,
  ReportsInput,
  REPORT_ROLES,
  type ReportsPerson,
} from "./reports-contract";
import { assertReportPermission } from "./reports-access";
import { databaseError } from "./security-errors";
import { allReportRows } from "./report-download";
import { SignInSummarySchema } from "./sign-in-metering";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const Options = z.object({
  agencies: z.array(z.object({ id: z.string(), name: z.string() })),
  joined_months: z.array(z.string()),
  launch_date: z.string().nullable(),
  first_date: z.string().nullable(),
  first_login: z.string().nullable(),
  capture_started_at: z.string(),
  as_of: z.string(),
  role: z.enum(REPORT_ROLES),
});
export const getReportsOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("reports_options");
    if (error)
      throw databaseError(error, "The Reports filters could not be loaded. Please try again.");
    return Options.parse(data);
  });
async function peoplePage(
  client: SupabaseClient<Database>,
  input: z.infer<typeof ReportsInput>,
  download = false,
) {
  const { data, error } = await client.rpc("reports_people_page", {
    _from: input.from,
    _to: input.to,
    _filters: input.filters,
    _limit: input.limit,
    _offset: input.offset,
    _sort: input.sort,
    _direction: input.direction,
    _include_emails: input.includeEmails,
    _download: download,
    ...(input.asOf ? { _as_of: input.asOf } : {}),
  });
  if (error) throw databaseError(error, "The People report could not be loaded. Please try again.");
  return ReportPage.parse(data);
}
export const getReportsPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportsInput.parse(input))
  .handler(({ context, data }) => peoplePage(context.supabase, data));
export const getReportsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        filters: ReportFilters,
        prior: z.object({ from: z.string(), to: z.string() }).nullable(),
        asOf: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data: d }) => {
    const { data, error } = await context.supabase.rpc("reports_sign_in_summary", {
      _from: d.from,
      _to: d.to,
      _filters: d.filters,
      ...(d.prior ? { _prior_from: d.prior.from, _prior_to: d.prior.to } : {}),
      ...(d.asOf ? { _as_of: d.asOf } : {}),
    });
    if (error)
      throw databaseError(error, "Sign-in activity could not be calculated. Please try again.");
    return SignInSummarySchema.parse(data);
  });
export const exportReportsPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportsInput.parse(input))
  .handler(async ({ context, data: d }) => {
    await assertReportPermission(context.supabase, "download_raw_data");
    if (d.includeEmails) await assertReportPermission(context.supabase, "include_email_addresses");
    const asOf = d.asOf ?? new Date().toISOString();
    const rows = await allReportRows<ReportsPerson>((offset) =>
      peoplePage(context.supabase, { ...d, asOf, limit: 200, offset }, true),
    );
    const { error } = await context.supabase.from("reports_export_history").insert({
      admin_id: context.userId,
      dataset: "People",
      filters: { ...d.filters, from: d.from, to: d.to, as_of: asOf },
      email_included: d.includeEmails,
      row_count: rows.length,
    });
    if (error) throw databaseError(error, "The download could not be recorded. Please try again.");
    return { rows, asOf };
  });
export const getReportsAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const { data, error } = await context.supabase
      .from("reports_access")
      .select("role")
      .eq("user_id", context.userId)
      .single();
    if (error) throw databaseError(error);
    return z.enum(REPORT_ROLES).parse(data.role);
  });
export const listReportsAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReportPermission(context.supabase, "manage_access");
    const { data, error } = await context.supabase
      .from("reports_access")
      .select("user_id,role,updated_at")
      .order("updated_at");
    if (error) throw databaseError(error);
    const ids = (data ?? []).map((a) => a.user_id);
    if (!ids.length) return [];
    const profiles = await context.supabase
      .from("profiles")
      .select("id,display_name,first_name,last_name")
      .in("id", ids);
    if (profiles.error) throw databaseError(profiles.error);
    return (data ?? []).map((a) => {
      const p = profiles.data?.find((p) => p.id === a.user_id);
      return {
        ...a,
        role: z.enum(REPORT_ROLES).parse(a.role),
        name:
          p?.display_name ||
          [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
          "Name not recorded",
      };
    });
  });
export const setReportsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(REPORT_ROLES) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "manage_access");
    const result = await context.supabase.rpc("reports_set_access", {
      _user_id: data.userId,
      _role: data.role,
    });
    if (result.error)
      throw databaseError(result.error, "Reports access could not be changed. Please try again.");
    return { ok: true };
  });
export const listReportViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const { data, error } = await context.supabase
      .from("reports_saved_views")
      .select("id,name,filters")
      .eq("user_id", context.userId)
      .order("name");
    if (error) throw databaseError(error);
    return (data ?? []).map((v) => ({ ...v, filters: ReportFilters.parse(v.filters) }));
  });
export const saveReportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().trim().min(1).max(80), filters: ReportFilters }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const result = await context.supabase
      .from("reports_saved_views")
      .insert({ user_id: context.userId, name: data.name, filters: data.filters });
    if (result.error) throw databaseError(result.error);
    return { ok: true };
  });
export const deleteReportView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const result = await context.supabase
      .from("reports_saved_views")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (result.error) throw databaseError(result.error);
    return { ok: true };
  });
export const getReportsTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        personId: z.string().max(100),
        from: z.string(),
        to: z.string(),
        filters: ReportFilters,
        offset: z.number().int().nonnegative().default(0),
        asOf: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ context, data: d }) => {
    const { data, error } = await context.supabase.rpc("reports_person_timeline", {
      _person_id: d.personId,
      _from: d.from,
      _to: d.to,
      _filters: d.filters,
      _offset: d.offset,
      _as_of: d.asOf,
    });
    if (error) throw databaseError(error, "The timeline could not be loaded. Please try again.");
    return z
      .object({
        total: z.number(),
        rows: z.array(
          z.object({
            id: z.string(),
            kind: z.string(),
            occurred_at: z.string(),
            label: z.string(),
          }),
        ),
        messages_tracked: z.boolean(),
      })
      .parse(data);
  });
export const getReportsNorthStar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportsInput.parse(input))
  .handler(async ({ context, data: d }) => {
    const { data, error } = await context.supabase.rpc("reports_north_star", {
      _from: d.from,
      _to: d.to,
      _filters: d.filters,
      ...(d.asOf ? { _as_of: d.asOf } : {}),
    });
    if (error) throw databaseError(error, "Two-sided engagement could not be calculated.");
    return z
      .object({ active: z.number(), total: z.number(), people: z.array(z.string()) })
      .parse(data);
  });
