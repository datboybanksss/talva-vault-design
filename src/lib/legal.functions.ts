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
  .validator((v: unknown) => input.parse(v))
  .handler(async ({ data }): Promise<CurrentLegalDocument> => {
    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const key =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"];

    if (!url || !key) {
      console.error("legal.functions: missing Supabase URL/publishable key on the server");
      return null;
    }

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabasePublic = createClient(url, key, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });

      const { data: row, error } = await supabasePublic
        .from("legal_documents")
        .select("id, doc_type, version, title, body, effective_at")
        .eq("doc_type", data.doc_type)
        .eq("is_current", true)
        .maybeSingle();

      if (error) {
        console.error("legal.functions: read failed", error.message);
        return null;
      }
      if (!row) return null;
      return row as NonNullable<CurrentLegalDocument>;
    } catch (err) {
      console.error("legal.functions: unexpected failure", err);
      return null;
    }
  });
