import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ReportsInput, reportDefaults, type ReportsFilters } from "./reports-contract";
import { assertReportPermission } from "./reports-access";
import { databaseError } from "./security-errors";
import {
  HistorySnapshot,
  analyseHistory,
  DATASETS,
  datasetRows,
  SECTIONS,
  SECTION_IDS,
  sectionRows,
  type SectionId,
  type Spend,
} from "./reports-analytics";
import { redactReportEmails } from "./reports-launch-scope";
import { sastDay } from "./sign-in-metering";
const Input = ReportsInput.and(
  z.object({
    prior: z.object({ from: z.string(), to: z.string() }).nullable().default(null),
    firstDate: z.string(),
  }),
);
/** People-list refinements never narrow the section figures; a drill-down applies them afterwards. */
const sectionFilters = (f: ReportsFilters): ReportsFilters => ({
  ...f,
  people: [],
  search: "",
  stage: "all",
  activity: "all",
});
async function loadHistory(from: string, to: string, filters: ReportsFilters, asOf: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.rpc("reports_history_snapshot", {
    _from: from,
    _to: to,
    _filters: filters,
    _as_of: asOf,
  });
  if (result.error)
    throw databaseError(result.error, "Historical reports could not be loaded. Please try again.");
  return HistorySnapshot.parse(result.data);
}
async function loadSpend(client: SupabaseClient<Database>): Promise<Spend[]> {
  const result = await client
    .from("reports_channel_spend")
    .select("channel,month,amount_cents")
    .order("month");
  if (result.error)
    throw databaseError(result.error, "Acquisition spend could not be loaded. Please try again.");
  return result.data.map((s) => ({
    channel: s.channel,
    month: s.month.slice(0, 7),
    amount_cents: Number(s.amount_cents),
  }));
}
export const getReportsAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const asOf = data.asOf ?? new Date().toISOString();
    const [h, spend] = await Promise.all([
      loadHistory(data.from, data.to, sectionFilters(data.filters), asOf),
      loadSpend(context.supabase),
    ]);
    return {
      ...analyseHistory(h, data.from, data.to, data.prior, data.firstDate, spend),
      dataset_counts: Object.fromEntries(
        DATASETS.map((d) => [d.id, datasetRows(h, d.id, data.from, data.to, false).length]),
      ),
    };
  });
const ExportInput = Input.and(
  z.object({ dataset: z.string(), fullHistory: z.boolean().default(false) }),
);
export const exportHistoricalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExportInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "download_raw_data");
    if (data.includeEmails)
      await assertReportPermission(context.supabase, "include_email_addresses");
    if (data.dataset !== "all" && !DATASETS.some((d) => d.id === data.dataset))
      throw new Error("Choose an available dataset.");
    const asOf = data.asOf ?? new Date().toISOString();
    const to = data.fullHistory ? sastDay(asOf) : data.to;
    const from = data.fullHistory ? data.firstDate : data.from,
      filters = data.fullHistory
        ? { ...reportDefaults, accounts: "all" as const }
        : sectionFilters(data.filters);
    const h = await loadHistory(from, to, filters, asOf);
    const datasets = DATASETS.filter((d) => data.dataset === "all" || d.id === data.dataset).map(
      (d) => ({
        id: d.id,
        label: d.label,
        rows: datasetRows(h, d.id, from, to, data.includeEmails),
      }),
    );
    const receipt = await context.supabase.from("reports_export_history").insert({
      admin_id: context.userId,
      dataset: data.dataset,
      filters: { ...filters, from, to, full_history: data.fullHistory },
      email_included: data.includeEmails,
      row_count: datasets.reduce((n, d) => n + d.rows.length, 0),
    });
    if (receipt.error) throw databaseError(receipt.error, "The download could not be recorded.");
    await assertReportPermission(context.supabase, "download_raw_data");
    if (data.includeEmails)
      await assertReportPermission(context.supabase, "include_email_addresses");
    return data.includeEmails ? datasets : redactReportEmails(datasets);
  });
/** One section's own records for the current filters. Email addresses are never included. */
export const exportReportSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    Input.and(
      z.object({
        section: z.custom<SectionId>(
          (v) => typeof v === "string" && SECTION_IDS.some((id) => id === v),
          "Choose an available section.",
        ),
      }),
    ).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "download_raw_data");
    const asOf = data.asOf ?? new Date().toISOString();
    const filters = sectionFilters(
      data.section.startsWith("business_")
        ? { ...data.filters, accounts: "real" as const }
        : data.filters,
    );
    const [h, spend] = await Promise.all([
      loadHistory(data.from, data.to, filters, asOf),
      loadSpend(context.supabase),
    ]);
    const analytics = analyseHistory(h, data.from, data.to, data.prior, data.firstDate, spend);
    const rows = redactReportEmails(sectionRows(h, analytics, data.section));
    const receipt = await context.supabase.from("reports_export_history").insert({
      admin_id: context.userId,
      dataset: `Section: ${SECTIONS[data.section]}`,
      filters: { ...filters, from: data.from, to: data.to, as_of: asOf },
      email_included: false,
      row_count: rows.length,
    });
    if (receipt.error) throw databaseError(receipt.error, "The download could not be recorded.");
    return { id: data.section.replaceAll("_", "-"), label: SECTIONS[data.section], rows };
  });
/** Board pack figures: always real accounts, from the first record to today. */
export const exportInvestorPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        asOf: z.string().datetime({ offset: true }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "download_raw_data");
    const asOf = data.asOf ?? new Date().toISOString(),
      to = sastDay(asOf),
      filters = { ...reportDefaults, accounts: "real" as const, preset: "all" as const };
    const [h, spend] = await Promise.all([
      loadHistory(data.firstDate, to, filters, asOf),
      loadSpend(context.supabase),
    ]);
    const a = analyseHistory(h, data.firstDate, to, null, data.firstDate, spend);
    const receipt = await context.supabase.from("reports_export_history").insert({
      admin_id: context.userId,
      dataset: "Investor pack",
      filters: { ...filters, from: data.firstDate, to, as_of: asOf },
      email_included: false,
      row_count: a.months.length,
    });
    if (receipt.error) throw databaseError(receipt.error, "The download could not be recorded.");
    const count = (
      figures: {
        label: string;
        value: number | string;
        total?: number;
        unit?: string;
        helper?: string;
      }[],
    ) =>
      figures.map((f) => ({
        label: f.label,
        value: `${f.value}${f.unit ?? ""}`,
        context:
          f.helper ?? (f.total !== undefined && typeof f.value === "number" ? `of ${f.total}` : ""),
      }));
    return {
      generated_at: asOf,
      from: data.firstDate,
      to,
      launch: a.launch,
      business: count(a.figures.business),
      launch_progress: count(a.figures.launch),
      network: count(a.figures.network),
      adoption: count(a.figures.adoption),
      trust: count(a.figures.trust),
      quality: count(a.figures.quality),
      agencies: count(a.figures.agencies),
      months: a.months.map((m) => ({
        month: m.month,
        talent: m.talent,
        agencies: m.agencies,
        total: m.total,
        active: m.active,
        invitations_sent: m.invitations_sent,
        invitations_accepted: m.invitations_accepted,
        documents: m.documents,
      })),
      acquisition: a.acquisition.map((r) => ({
        channel: r.channel,
        registered: r.registered,
        spend: r.spend,
        cost: r.cost,
      })),
    };
  });
export const setReportChannelSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.string().regex(/^[a-z_]{1,40}$/, "Choose a channel."),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month."),
        amount: z.number().min(0).max(1_000_000_000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "manage_spend");
    const result = await context.supabase.rpc("reports_set_channel_spend", {
      _channel: data.channel,
      _month: `${data.month}-01`,
      // The database clears the entry when no amount is given.
      ...(data.amount === null ? {} : { _amount_cents: Math.round(data.amount * 100) }),
    });
    if (result.error)
      throw databaseError(result.error, "The spend could not be saved. Please try again.");
    return { ok: true };
  });
export const listReportDownloads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const result = await context.supabase
      .from("reports_export_history")
      .select("id,dataset,row_count,email_included,created_at")
      .eq("admin_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw databaseError(result.error, "Download history could not be loaded.");
    return result.data;
  });
