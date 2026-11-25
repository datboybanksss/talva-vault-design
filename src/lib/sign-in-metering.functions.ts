import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { databaseError } from "./security-errors";
import { assertReportPermission } from "./reports-access";
import {
  SignInPeriodInput,
  SignInPageInput,
  SignInSummarySchema,
  SignInPageSchema,
} from "./sign-in-metering";

export async function loadSignInPage(supabase: SupabaseClient<Database>, input: unknown) {
  await assertReportPermission(supabase, "download_raw_data");
  const d = SignInPageInput.parse(input);
  const { data, error } = await supabase.rpc("admin_sign_in_page", {
    _from: d.from,
    _to: d.to,
    _accounts: d.accounts,
    _type: d.type,
    _population: d.population,
    ...(d.agency ? { _agency: d.agency } : {}),
    _sort: d.sort,
    _direction: d.direction,
    _limit: d.limit,
    _offset: d.offset,
    ...(d.asOf ? { _as_of: d.asOf } : {}),
  });
  if (error)
    throw databaseError(error, "These sign-in records could not be loaded. Please try again.");
  return SignInPageSchema.parse(data);
}
export const getSignInProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SignInPageInput.parse(d))
  .handler(async ({ data, context }) => loadSignInPage(context.supabase, data));
export const getSignInSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SignInPeriodInput.parse(d))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("admin_sign_in_summary", {
      _from: d.from,
      _to: d.to,
      _accounts: d.accounts,
      ...(d.asOf ? { _as_of: d.asOf } : {}),
    });
    if (error)
      throw databaseError(error, "Sign-in activity could not be calculated. Please try again.");
    return SignInSummarySchema.parse(data);
  });
