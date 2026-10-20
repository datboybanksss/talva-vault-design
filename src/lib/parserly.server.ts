/**
 * Parserly adapter — the ONE place the document AI plugs in.
 *
 * Contract (see AGENTS.md / the handover note):
 *   analyseDocument({ scope, documentId }) -> AdapterResult
 *   pollAnalysis({ scope, documentId, providerRef }) -> AdapterResult
 *
 * AdapterResult:
 *   { status: "completed", suggestion: FilingSuggestion }   // sync result, already mapped to the catalogue
 *   { status: "processing", providerRef }                   // async job accepted; we poll with providerRef
 *   { status: "failed", errorCode }                         // e.g. "parserly_error", "unreadable_document", "file_missing"
 *   { status: "unavailable", errorCode: "not_configured" }  // Parserly not set up here — NOT an error
 *
 * Callers (document-ai.server.ts) have already checked the person's AI switch
 * and authorised them for the document. This module never decides that.
 *
 * Wiring Parserly in: implement `parserlyRequest` / `parserlyPoll` below. They
 * receive the file bytes and the closed folder catalogue, and return the raw
 * Parserly answer. `toSuggestion` maps it onto the catalogue (never invents a
 * folder). Configuration: secrets PARSERLY_API_KEY and PARSERLY_API_URL.
 */

import type { AdapterResult, AnalysisScope, FilingSuggestion } from "@/lib/document-ai-core";
import { mapFolderToCatalogue, normaliseExpiry } from "@/lib/document-ai-core";

export type ParserlyRaw = {
  folder?: string | null;
  expiry_date?: string | null;
  reminder_lead_days?: number | null;
  confidence?: "high" | "medium" | "low" | null;
  rationale?: string | null;
  folder_source_text?: string | null;
  expiry_source_text?: string | null;
};

type CatalogueItem = { id: string; label: string };

type ParserlyRequest = {
  apiUrl: string;
  apiKey: string;
  fileName: string;
  mimeType: string | null;
  bytes: ArrayBuffer;
  catalogue: CatalogueItem[];
};

/**
 * Replace with the real Parserly call. Return { raw } for a synchronous answer,
 * { providerRef } when Parserly queues the job, or throw a ParserlyError.
 */
async function parserlyRequest(
  _req: ParserlyRequest,
): Promise<{ raw: ParserlyRaw } | { providerRef: string } | null> {
  return null; // not wired yet → treated as unavailable
}

/** Replace with the real Parserly status lookup for async jobs. */
async function parserlyPoll(
  _cfg: { apiUrl: string; apiKey: string },
  _providerRef: string,
): Promise<{ raw: ParserlyRaw } | { providerRef: string } | { failed: string } | null> {
  return null;
}

export class ParserlyError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

function config() {
  const apiKey = process.env["PARSERLY_API_KEY"];
  const apiUrl = process.env["PARSERLY_API_URL"];
  if (!apiKey || !apiUrl) return null;
  return { apiKey, apiUrl };
}

export function isParserlyConfigured() {
  return config() !== null;
}

export function toSuggestion(raw: ParserlyRaw, catalogue: CatalogueItem[]): FilingSuggestion {
  const lead =
    typeof raw.reminder_lead_days === "number" &&
    raw.reminder_lead_days >= 1 &&
    raw.reminder_lead_days <= 365
      ? Math.round(raw.reminder_lead_days)
      : null;
  const folderId = mapFolderToCatalogue(raw.folder ?? null, catalogue);
  const expiry = normaliseExpiry(raw.expiry_date ?? null);
  return {
    folder_id: folderId,
    expiry_date: expiry,
    reminder_lead_days: lead,
    confidence: raw.confidence ?? null,
    rationale: raw.rationale ?? null,
    folder_source_text: folderId ? (raw.folder_source_text ?? null) : null,
    expiry_source_text: expiry ? (raw.expiry_source_text ?? null) : null,
  };
}

async function loadDocument(scope: AnalysisScope, documentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (scope === "talent") {
    const { data: doc } = await supabaseAdmin
      .from("talent_private_documents")
      .select("id, user_id, name, storage_path, mime_type")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc?.storage_path) return null;
    const { data: folders } = await supabaseAdmin
      .from("talent_private_folders")
      .select("id, parent_id, name")
      .eq("user_id", doc.user_id)
      .is("removed_at", null);
    const rows = (folders ?? []) as { id: string; parent_id: string | null; name: string }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const catalogue = rows.map((r) => {
      const parts = [r.name];
      let cur = r.parent_id ? byId.get(r.parent_id) : undefined;
      let guard = 0;
      while (cur && guard++ < 5) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      return { id: r.id, label: parts.join(" → ") };
    });
    return {
      bucket: "talent-private-documents",
      path: doc.storage_path,
      name: doc.name,
      mime: doc.mime_type,
      catalogue,
    };
  }
  const { data: doc } = await supabaseAdmin
    .from("talent_shared_documents")
    .select("id, agency_id, talent_link_id, name, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.storage_path) return null;
  const { data: folders } = await supabaseAdmin
    .from("agency_talent_folders")
    .select("folder_name")
    .eq("agency_id", doc.agency_id)
    .eq("talent_link_id", doc.talent_link_id as string);
  const catalogue = ((folders ?? []) as { folder_name: string }[]).map((f) => ({
    id: f.folder_name,
    label: f.folder_name,
  }));
  return {
    bucket: "talent-documents",
    path: doc.storage_path,
    name: doc.name,
    mime: null,
    catalogue,
  };
}

export async function analyseDocument(input: {
  scope: AnalysisScope;
  documentId: string;
}): Promise<AdapterResult> {
  const cfg = config();
  if (!cfg) return { status: "unavailable", errorCode: "not_configured" };

  const doc = await loadDocument(input.scope, input.documentId);
  if (!doc) return { status: "failed", errorCode: "file_missing" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: blob, error } = await supabaseAdmin.storage.from(doc.bucket).download(doc.path);
  if (error || !blob) return { status: "failed", errorCode: "file_missing" };

  try {
    const res = await parserlyRequest({
      ...cfg,
      fileName: doc.name,
      mimeType: doc.mime,
      bytes: await blob.arrayBuffer(),
      catalogue: doc.catalogue,
    });
    if (!res) return { status: "unavailable", errorCode: "not_configured" };
    if ("providerRef" in res) return { status: "processing", providerRef: res.providerRef };
    return { status: "completed", suggestion: toSuggestion(res.raw, doc.catalogue) };
  } catch (e) {
    return { status: "failed", errorCode: e instanceof ParserlyError ? e.code : "parserly_error" };
  }
}

export async function pollAnalysis(input: {
  scope: AnalysisScope;
  documentId: string;
  providerRef: string;
}): Promise<AdapterResult> {
  const cfg = config();
  if (!cfg) return { status: "unavailable", errorCode: "not_configured" };
  try {
    const res = await parserlyPoll(cfg, input.providerRef);
    if (!res) return { status: "unavailable", errorCode: "not_configured" };
    if ("failed" in res) return { status: "failed", errorCode: res.failed };
    if ("providerRef" in res) return { status: "processing", providerRef: res.providerRef };
    const doc = await loadDocument(input.scope, input.documentId);
    return { status: "completed", suggestion: toSuggestion(res.raw, doc?.catalogue ?? []) };
  } catch (e) {
    return { status: "failed", errorCode: e instanceof ParserlyError ? e.code : "parserly_error" };
  }
}
