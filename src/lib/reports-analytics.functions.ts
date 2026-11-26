import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ReportsInput, reportDefaults } from "./reports-contract";
import { assertReportPermission } from "./reports-access";
import { databaseError } from "./security-errors";
import { HistorySnapshot, analyseHistory, DATASETS, datasetRows } from "./reports-analytics";
import { redactReportEmails } from "./reports-launch-scope";
const Input = ReportsInput.and(
  z.object({
    prior: z.object({ from: z.string(), to: z.string() }).nullable().default(null),
    firstDate: z.string(),
  }),
);
export const getReportsAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ context, data }) => {
    await assertReportPermission(context.supabase, "view_reports");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("reports_history_snapshot", {
      _from: data.from,
      _to: data.to,
      _filters: data.filters,
      _as_of: data.asOf ?? new Date().toISOString(),
    });
    if (result.error)
      throw databaseError(
        result.error,
        "Historical reports could not be loaded. Please try again.",
      );
    const h = HistorySnapshot.parse(result.data);
    return {
      ...analyseHistory(h, data.from, data.to, data.prior, data.firstDate),
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const to = data.fullHistory
      ? new Date(new Date(data.asOf ?? new Date().toISOString()).getTime() + 7200000)
          .toISOString()
          .slice(0, 10)
      : data.to;
    const from = data.fullHistory ? data.firstDate : data.from,
      filters = data.fullHistory ? { ...reportDefaults, accounts: "all" as const } : data.filters;
    const result = await supabaseAdmin.rpc("reports_history_snapshot", {
      _from: from,
      _to: to,
      _filters: filters,
      _as_of: data.asOf ?? new Date().toISOString(),
    });
    if (result.error)
      throw databaseError(result.error, "The historical data could not be downloaded.");
    const h = HistorySnapshot.parse(result.data);
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
