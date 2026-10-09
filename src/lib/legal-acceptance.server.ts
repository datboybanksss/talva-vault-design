import { getRequest } from "@tanstack/react-start/server";

export type LegalDocType = "agency" | "talent";
export type AcceptanceMethod = "activation" | "reacceptance";

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
 * Appends a Terms & Conditions acceptance. IP and user agent come from the
 * request; the database trigger stamps everything else (hash, time, identity,
 * role, agency, proof reference) so nothing is taken from the browser.
 * Records are append-only — accepting the same version twice is a no-op.
 * Throws when the acceptance cannot be recorded so callers can roll back.
 */
export async function recordLegalAcceptance(args: {
  userId: string;
  docType: LegalDocType;
  version?: string;
  documentId?: string;
  method: AcceptanceMethod;
}): Promise<{ proof_ref: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let q = supabaseAdmin.from("legal_documents").select("id, doc_type, version").eq("doc_type", args.docType);
  q = args.documentId ? q.eq("id", args.documentId) : q.eq("version", args.version ?? "");
  const { data: doc } = await q.maybeSingle();
  if (!doc) throw new Error(`Unknown ${args.docType} Terms & Conditions version.`);

  const meta = requestMeta();
  const { data, error } = await supabaseAdmin
    .from("legal_acceptances")
    .insert({
      user_id: args.userId,
      document_id: doc.id,
      doc_type: doc.doc_type,
      version: doc.version,
      acceptance_method: args.method,
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    })
    .select("proof_ref")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("legal_acceptances")
        .select("proof_ref")
        .eq("user_id", args.userId)
        .eq("doc_type", doc.doc_type)
        .eq("version", doc.version)
        .maybeSingle();
      return { proof_ref: existing?.proof_ref ?? null };
    }
    throw new Error(error.message);
  }
  return { proof_ref: data?.proof_ref ?? null };
}
