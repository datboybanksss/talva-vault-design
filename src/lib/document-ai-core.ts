/**
 * Document AI (Parserly) — pure rules shared by the server and the tests.
 *
 * Nothing here talks to the database or to Parserly directly: every side effect
 * is passed in, so the rules ("never send a file when the switch is off",
 * "'ai' only for a completed, matching analysis", "opting out cancels queued
 * work") can be tested without a network.
 */

export type AnalysisScope = "talent" | "agency";

export type AnalysisStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "unavailable"
  | "skipped_opted_out";

/** The filing suggestion shape the popup understands. */
export type FilingSuggestion = {
  /** talent: folder uuid | agency: folder name. null = no destination suggested. */
  folder_id: string | null;
  /** Detected expiry as YYYY-MM-DD, or null when none was found. */
  expiry_date: string | null;
  /** Suggested reminder lead time in days, or null to fall back to the portal default. */
  reminder_lead_days: number | null;
  confidence?: "high" | "medium" | "low" | null;
  rationale?: string | null;
  /** Verbatim text from the document the folder suggestion was drawn from. */
  folder_source_text?: string | null;
  /** Verbatim text the expiry date was read from. */
  expiry_source_text?: string | null;
};

/**
 * What the Parserly adapter returns.
 * - completed: a suggestion already mapped onto the folder catalogue.
 * - processing: Parserly accepted the job asynchronously; poll with providerRef.
 * - failed: Parserly ran (or was reached) but could not produce a result.
 * - unavailable: Parserly is not configured in this environment. Not an error.
 */
export type AdapterResult =
  | { status: "completed"; suggestion: FilingSuggestion }
  | { status: "processing"; providerRef: string }
  | { status: "failed"; errorCode: string }
  | { status: "unavailable"; errorCode: string };

export type AnalysisRow = {
  status: AnalysisStatus;
  suggestion: FilingSuggestion | null;
  error_code: string | null;
  provider_ref: string | null;
  updated_at: string;
};

/** A job still "processing" after this long is treated as failed. */
export const ANALYSIS_TIMEOUT_MS = 10 * 60_000;

export function isPending(status: AnalysisStatus | null | undefined) {
  return status === "queued" || status === "processing";
}

export function resultToPatch(r: AdapterResult): Partial<AnalysisRow> & { completed_at?: string | null } {
  switch (r.status) {
    case "completed":
      return { status: "completed", suggestion: r.suggestion, error_code: null, completed_at: new Date().toISOString() };
    case "processing":
      return { status: "processing", provider_ref: r.providerRef, error_code: null };
    case "failed":
      return { status: "failed", error_code: r.errorCode, completed_at: new Date().toISOString() };
    case "unavailable":
      return { status: "unavailable", error_code: r.errorCode, completed_at: new Date().toISOString() };
  }
}

export type AdvanceDeps = {
  /** The person's own "Organise documents with AI" switch, read on the server. */
  aiEnabled: () => Promise<boolean>;
  /** Atomically move queued → processing. false = someone else already took it. */
  claim: () => Promise<boolean>;
  save: (patch: Partial<AnalysisRow> & { completed_at?: string | null }) => Promise<void>;
  analyse: () => Promise<AdapterResult>;
  poll: (providerRef: string) => Promise<AdapterResult>;
  now?: () => number;
};

/**
 * Move one analysis forward a step. The file is only ever sent (analyse) after
 * the switch has been re-checked on the server, so a switch turned off between
 * upload and processing still stops it.
 */
export async function advanceAnalysis(row: AnalysisRow, deps: AdvanceDeps): Promise<AnalysisRow> {
  const now = deps.now?.() ?? Date.now();
  const apply = async (patch: Partial<AnalysisRow> & { completed_at?: string | null }) => {
    await deps.save(patch);
    return { ...row, ...patch } as AnalysisRow;
  };

  if (row.status === "queued") {
    if (!(await deps.aiEnabled())) {
      return apply({ status: "skipped_opted_out", error_code: "opted_out" });
    }
    if (!(await deps.claim())) return row;
    let result: AdapterResult;
    try {
      result = await deps.analyse();
    } catch {
      result = { status: "failed", errorCode: "adapter_error" };
    }
    return apply(resultToPatch(result));
  }

  if (row.status === "processing") {
    if (!(await deps.aiEnabled())) {
      return apply({ status: "skipped_opted_out", error_code: "cancelled_opt_out" });
    }
    if (now - new Date(row.updated_at).getTime() > ANALYSIS_TIMEOUT_MS) {
      return apply({ status: "failed", error_code: "timeout" });
    }
    if (!row.provider_ref) return row;
    let result: AdapterResult;
    try {
      result = await deps.poll(row.provider_ref);
    } catch {
      result = { status: "failed", errorCode: "adapter_error" };
    }
    if (result.status === "processing" && result.providerRef === row.provider_ref) return row;
    return apply(resultToPatch(result));
  }

  return row;
}

export type PreferenceChangeDeps = {
  audit: (next: boolean) => Promise<void>;
  cancelQueued: () => Promise<void>;
};

/** Every switch change is audited; switching off cancels this person's queued analyses. */
export async function applyAiPreferenceChange(next: boolean, deps: PreferenceChangeDeps) {
  await deps.audit(next);
  if (!next) await deps.cancelQueued();
}

/** "Analyse with AI" is offered only to someone with the switch on, for a pending document. */
export function canAnalyseWithAi(aiEnabled: boolean | undefined, pendingReview: boolean | undefined) {
  return aiEnabled === true && pendingReview === true;
}

/**
 * confirmDocumentFiling may record 'ai' for a field only when a completed
 * analysis exists for the document and the saved value is exactly what it
 * returned. Returns an error message, or null when the sources are allowed.
 */
export function checkAiSources(input: {
  aiEnabled: boolean;
  analysis: { status: AnalysisStatus; suggestion: FilingSuggestion | null } | null;
  folderSource: string | null;
  expirySource: string | null;
  destination: string | null;
  expiresAt: string | null;
}): string | null {
  const wantsFolder = input.folderSource === "ai";
  const wantsExpiry = input.expirySource === "ai";
  if (!wantsFolder && !wantsExpiry) return null;
  if (!input.aiEnabled) {
    return "AI filing is switched off for your account, so values can't be saved as AI-suggested.";
  }
  const s = input.analysis?.status === "completed" ? input.analysis.suggestion : null;
  if (!s) return "No completed AI analysis exists for this document, so values can't be saved as AI-suggested.";
  if (wantsFolder && (!s.folder_id || s.folder_id !== input.destination)) {
    return "The folder doesn't match the AI suggestion, so it can't be saved as AI-suggested.";
  }
  if (wantsExpiry) {
    const saved = input.expiresAt ? input.expiresAt.slice(0, 10) : null;
    if (!s.expiry_date || s.expiry_date !== saved) {
      return "The expiry date doesn't match the AI suggestion, so it can't be saved as AI-suggested.";
    }
  }
  return null;
}

/**
 * Map a raw folder answer from Parserly onto the live catalogue. Matches by id
 * first, then by full label, then by the last path segment (case-insensitive).
 * Never invents a folder: no match → null.
 */
export function mapFolderToCatalogue(
  raw: string | null | undefined,
  catalogue: { id: string; label: string }[],
): string | null {
  if (!raw) return null;
  const want = raw.trim().toLowerCase();
  if (!want) return null;
  const byId = catalogue.find((c) => c.id.toLowerCase() === want);
  if (byId) return byId.id;
  const byLabel = catalogue.find((c) => c.label.toLowerCase() === want);
  if (byLabel) return byLabel.id;
  const leaf = catalogue.filter((c) => c.label.split(" → ").pop()!.toLowerCase() === want);
  return leaf.length === 1 ? leaf[0].id : null;
}

/** Normalise a date-ish value to YYYY-MM-DD, or null. */
export function normaliseExpiry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}
