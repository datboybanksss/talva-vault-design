import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public server functions for legal copy shown on the unauthenticated invite
// activation pages. Content lives in public.legal_documents — never hardcoded.

export type LegalDocType = "agency" | "talent";

export type CurrentLegalDocument = {
  id: string;
  doc_type: LegalDocType;
  version: string;
  title: string;
  body: string;
  effective_at: string;
} | null;

const input = z.object({ doc_type: z.enum(["agency", "talent"]) });

export const getCurrentLegalDocument = createServerFn({ method: "POST" })
  .inputValidator((v) => input.parse(v))
  .handler(async ({ data }): Promise<CurrentLegalDocument> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabasePublic = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const { data: row } = await supabasePublic
      .from("legal_documents")
      .select("id, doc_type, version, title, body, effective_at")
      .eq("doc_type", data.doc_type)
      .eq("is_current", true)
      .maybeSingle();

    if (!row) return null;
    return row as NonNullable<CurrentLegalDocument>;
  });
