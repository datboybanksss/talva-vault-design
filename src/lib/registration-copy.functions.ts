import { createServerFn } from "@tanstack/react-start";

export type RegistrationCopy = {
  proof_label: string;
  documents_help: string;
  draft_help: string;
  proof_required: string;
  revoked_notice: string;
  revoke_help: string;
  privacy_help: string;
  legal_name_label: string;
  birth_date_label: string;
  birth_date_invalid: string;
  acceptance_unavailable: string;
  account_unavailable: string;
  id_not_collected: string;
};

export const getRegistrationCopy = createServerFn({ method: "GET" }).handler(async (): Promise<RegistrationCopy> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("platform_settings").select("value").eq("key", "talent_registration_copy").maybeSingle();
  if (error || !data || !data.value || typeof data.value !== "object" || Array.isArray(data.value)) throw new Error("We couldn't load the registration details. Please try again.");
  const value = data.value;
  const read = (key: keyof RegistrationCopy) => {
    const text = value[key];
    if (typeof text !== "string" || !text.trim()) throw new Error("We couldn't load the registration details. Please try again.");
    return text;
  };
  return { proof_label: read("proof_label"), documents_help: read("documents_help"), draft_help: read("draft_help"), proof_required: read("proof_required"), revoked_notice: read("revoked_notice"), revoke_help: read("revoke_help"), privacy_help: read("privacy_help"), legal_name_label: read("legal_name_label"), birth_date_label: read("birth_date_label"), birth_date_invalid: read("birth_date_invalid"), acceptance_unavailable: read("acceptance_unavailable"), account_unavailable: read("account_unavailable"), id_not_collected: read("id_not_collected") };
});