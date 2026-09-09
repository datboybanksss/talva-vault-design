import { getRequest } from "@tanstack/react-start/server";

export type LegalDocType = "agency" | "talent";

function requestMeta(): { ip_address: string | null; user_agent: string | null } {
  try {
    const h = getRequest()?.headers;
    if (!h) return { ip_address: null, user_agent: null };
    const ip =
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      null;
    return { ip_address: ip || null, user_agent: h.get("user-agent") || null };
  } catch {
    return { ip_address: null, user_agent: null };
  }
}

/**
 * Writes the Terms & Conditions acceptance for a freshly activated account.
 * Throws when the acceptance cannot be recorded so the caller can roll the
 * activation back — an account must never exist without an acceptance row.
 */
export async function recordLegalAcceptance(args: {
  userId: string;
  docType: LegalDocType;
  version: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: doc } = await supabaseAdmin
    .from("legal_documents")
    .select("id, version")
    .eq("doc_type", args.docType)
    .eq("version", args.version)
    .maybeSingle();

  if (!doc) throw new Error(`Unknown ${args.docType} Terms & Conditions version.`);

  const meta = requestMeta();
  const { error } = await supabaseAdmin.from("legal_acceptances").upsert(
    {
      user_id: args.userId,
      document_id: doc.id,
      doc_type: args.docType,
      version: doc.version,
      accepted_at: new Date().toISOString(),
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    },
    { onConflict: "user_id,doc_type,version" },
  );

  if (error) throw new Error(error.message);
}
