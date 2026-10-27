import type { RegistrationCopy } from "./registration-copy.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { databaseError } from "./security-errors";

export async function registrationCopy(): Promise<RegistrationCopy> {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "talent_registration_copy")
    .maybeSingle();
  if (error) throw databaseError(error);
  const value = data?.value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("We couldn't load the registration details. Please try again.");
  const read = (key: keyof RegistrationCopy) => {
    const text = value[key];
    if (typeof text !== "string" || !text.trim())
      throw new Error("We couldn't load the registration details. Please try again.");
    return text;
  };
  return {
    proof_label: read("proof_label"),
    documents_help: read("documents_help"),
    draft_help: read("draft_help"),
    proof_required: read("proof_required"),
    revoked_notice: read("revoked_notice"),
    revoke_help: read("revoke_help"),
    privacy_help: read("privacy_help"),
    legal_name_label: read("legal_name_label"),
    birth_date_label: read("birth_date_label"),
    birth_date_invalid: read("birth_date_invalid"),
    acceptance_unavailable: read("acceptance_unavailable"),
    account_unavailable: read("account_unavailable"),
    id_not_collected: read("id_not_collected"),
  };
}
