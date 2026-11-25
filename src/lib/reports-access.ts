import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ReportPermission } from "./reports-contract";
import { databaseError } from "./security-errors";
export async function assertReportPermission(
  client: SupabaseClient<Database>,
  permission: ReportPermission,
) {
  const { data, error } = await client.rpc("reports_can", { _permission: permission });
  if (error) throw databaseError(error, "We couldn’t check your Reports access. Please try again.");
  if (!data)
    throw new Error(
      "REPORT_ACCESS_DENIED: Your Reports role does not allow this action. Ask a Reports Owner to review your access.",
    );
}
