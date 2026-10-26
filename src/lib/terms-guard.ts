import { databaseError } from "./security-errors";
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCOUNT_READ_ONLY_MESSAGE, ACCOUNT_SUSPENDED_CODE } from "@/lib/account-state";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Terms enforcement. The single rule lives in the database
 * function has_accepted_current_terms() (admins always pass).
 */
export const TERMS_NOT_ACCEPTED_MESSAGE =
  "TERMS_NOT_ACCEPTED: please accept the current Terms & Conditions to continue";

export async function assertTermsAccepted(
  supabase: SupabaseClient,
  userId: string,
  docType: "talent" | "agency",
) {
  const { data, error } = await supabase.rpc("has_accepted_current_terms", {
    _user_id: userId,
    _doc_type: docType,
  });
  if (error) throw databaseError(error);
  if (!data) throw new Error(TERMS_NOT_ACCEPTED_MESSAGE);
}

/** Use instead of requireSupabaseAuth on every talent-portal server function. */
export const requireTalentTermsAccepted = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    await assertTermsAccepted(context.supabase, context.userId, "talent");
    return next();
  });

/** Suspended talent are read-only (database rule talent_account_writable). */
export async function assertTalentWritable(supabase: Pick<SupabaseClient, "rpc">, userId: string) {
  const { data, error } = await supabase.rpc("talent_account_writable", { _user_id: userId });
  if (error) throw databaseError(error);
  if (!data) throw new Error(`${ACCOUNT_SUSPENDED_CODE}: ${ACCOUNT_READ_ONLY_MESSAGE}`);
}

/** Use on every talent-portal server function that adds, changes or deletes. */
export const requireTalentWritable = createMiddleware({ type: "function" })
  .middleware([requireTalentTermsAccepted])
  .server(async ({ next, context }) => {
    await assertTalentWritable(context.supabase, context.userId);
    return next();
  });
