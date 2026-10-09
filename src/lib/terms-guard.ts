import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side Terms enforcement. The single rule lives in the database
 * function has_accepted_current_terms() (admins always pass).
 */
export const TERMS_NOT_ACCEPTED_MESSAGE =
  "TERMS_NOT_ACCEPTED: please accept the current Terms & Conditions to continue";

export async function assertTermsAccepted(supabase: any, userId: string, docType: "talent" | "agency") {
  const { data, error } = await supabase.rpc("has_accepted_current_terms", {
    _user_id: userId,
    _doc_type: docType,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error(TERMS_NOT_ACCEPTED_MESSAGE);
}

/** Use instead of requireSupabaseAuth on every talent-portal server function. */
export const requireTalentTermsAccepted = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    await assertTermsAccepted((context as any).supabase, (context as any).userId, "talent");
    return next();
  });
