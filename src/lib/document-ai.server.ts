/**
 * Document AI orchestration (server only). Owns every write to
 * document_ai_analyses — through the service role, after the caller has been
 * authorised for the document by the calling server function.
 */

import type { AnalysisRow, AnalysisScope, AnalysisStatus } from "@/lib/document-ai-core";
import { advanceAnalysis } from "@/lib/document-ai-core";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** A person's own "Organise documents with AI" switch (default on). */
export async function userAiEnabled(userId: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db.from("profiles").select("ai_filing_enabled").eq("id", userId).maybeSingle();
  return data?.ai_filing_enabled !== false;
}

/**
 * Called at upload time. Reads the uploader's switch on the server: off →
 * skipped_opted_out (the file is never sent); on → queued, picked up by the
 * filing popup's first status check.
 */
export async function recordUploadAnalysis(input: {
  scope: AnalysisScope;
  documentId: string;
  uploaderId: string;
  agencyId?: string | null;
}) {
  const enabled = await userAiEnabled(input.uploaderId);
  const db = await admin();
  const status: AnalysisStatus = enabled ? "queued" : "skipped_opted_out";
  await db.from("document_ai_analyses").upsert(
    {
      scope: input.scope,
      document_id: input.documentId,
      requested_by: input.uploaderId,
      agency_id: input.agencyId ?? null,
      status,
      suggestion: null,
      error_code: enabled ? null : "opted_out",
      provider_ref: null,
      completed_at: null,
    },
    { onConflict: "scope,document_id" },
  );
  return status;
}

/**
 * (Re)start an analysis on request — Retry, "Analyse with AI", or switching AI
 * on from the popup. The requester's own switch decides.
 */
export async function restartAnalysis(input: {
  scope: AnalysisScope;
  documentId: string;
  requesterId: string;
  agencyId?: string | null;
}) {
  const db = await admin();
  const { data: existing } = await db
    .from("document_ai_analyses")
    .select("attempts")
    .eq("scope", input.scope)
    .eq("document_id", input.documentId)
    .maybeSingle();
  await recordUploadAnalysis({
    scope: input.scope,
    documentId: input.documentId,
    uploaderId: input.requesterId,
    agencyId: input.agencyId,
  });
  await db
    .from("document_ai_analyses")
    .update({ attempts: (existing?.attempts ?? 0) + 1 })
    .eq("scope", input.scope)
    .eq("document_id", input.documentId);
  return advanceDocumentAnalysis({ ...input });
}

export type AnalysisView = {
  status: AnalysisStatus | null;
  suggestion: AnalysisRow["suggestion"];
  error_code: string | null;
};

/** Move the analysis one step forward and return what the popup should show. */
export async function advanceDocumentAnalysis(input: {
  scope: AnalysisScope;
  documentId: string;
  requesterId: string;
}): Promise<AnalysisView> {
  const db = await admin();
  const { data: row } = await db
    .from("document_ai_analyses")
    .select("status, suggestion, error_code, provider_ref, updated_at, requested_by")
    .eq("scope", input.scope)
    .eq("document_id", input.documentId)
    .maybeSingle();
  if (!row) return { status: null, suggestion: null, error_code: null };

  const where = (q: any) => q.eq("scope", input.scope).eq("document_id", input.documentId);
  const { analyseDocument, pollAnalysis } = await import("@/lib/parserly.server");

  const next = await advanceAnalysis(row as AnalysisRow, {
    // The switch that counts is the person who asked for this analysis.
    aiEnabled: () => userAiEnabled(row.requested_by),
    claim: async () => {
      const { data } = await where(db.from("document_ai_analyses").update({ status: "processing" }))
        .eq("status", "queued")
        .select("id");
      return (data ?? []).length > 0;
    },
    save: async (patch) => {
      await where(db.from("document_ai_analyses").update(patch));
    },
    analyse: () => analyseDocument({ scope: input.scope, documentId: input.documentId }),
    poll: (ref) => pollAnalysis({ scope: input.scope, documentId: input.documentId, providerRef: ref }),
  });

  return { status: next.status, suggestion: next.suggestion, error_code: next.error_code };
}

/** Opting out: cancel this person's analyses that have not finished. */
export async function cancelQueuedAnalysesFor(userId: string) {
  const db = await admin();
  await db
    .from("document_ai_analyses")
    .update({ status: "skipped_opted_out", error_code: "cancelled_opt_out", suggestion: null })
    .eq("requested_by", userId)
    .in("status", ["queued", "processing"]);
}

export async function readAnalysis(scope: AnalysisScope, documentId: string) {
  const db = await admin();
  const { data } = await db
    .from("document_ai_analyses")
    .select("status, suggestion")
    .eq("scope", scope)
    .eq("document_id", documentId)
    .maybeSingle();
  return (data ?? null) as { status: AnalysisStatus; suggestion: any } | null;
}
