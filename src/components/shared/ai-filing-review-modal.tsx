/**
 * Filing review popup — shared by BOTH the Agency Document Vault and the Talent
 * Private Vault. Opens after an upload completes, before the document counts as filed.
 *
 * Modes:
 * - `analysing` — AI is on and the Parserly analysis is queued/processing. A
 *                 neutral "Reading your document…" note; fields stay usable and
 *                 anything saved now is recorded as the person's own ('user').
 * - `ai`        — Parserly returned a suggestion. Fields are pre-filled and
 *                 labelled "Suggested by AI", with confidence and the quoted source.
 * - `filename`  — AI is on but Parserly is unavailable here, and the file name
 *                 matched something. Labelled "Suggested · Based on the file name".
 *                 Never presented or recorded as AI.
 * - `failed`    — the analysis failed or is unavailable (and no filename match).
 *                 Neutral note with Retry; nothing labelled.
 * - `manual`    — the person's "Organise documents with AI" switch is off. No
 *                 analysing state, no badges, nothing sent for analysis.
 *
 * A small link flips the same per-user switch: on → runs the analysis for this
 * document now; off → drops straight to manual and discards any suggestion.
 * A field's label flips to "Edited by you" once touched, and a late-arriving
 * suggestion never overwrites a field the person already changed.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles,
  FolderTree,
  CalendarClock,
  X,
  Loader2,
  Clock,
  Check,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import {
  getFilingCatalog,
  confirmDocumentFiling,
  skipDocumentFiling,
  getDocumentAnalysis,
  startDocumentAnalysis,
  setAiFilingPreference,
} from "@/lib/ai-filing.functions";
import { isPending, type AnalysisStatus, type FilingSuggestion } from "@/lib/document-ai-core";
import { Button } from "@/components/ui/button";
import { DocumentModal } from "@/components/shared/document-modal";
import { syncAiFilingPreference } from "@/lib/ai-filing-cache";
import { suggestFromFileName } from "@/lib/filing-heuristics";

export type AiFilingScope = "talent" | "agency";

export type { FilingSuggestion };

type AnalysisView = {
  status: AnalysisStatus | null;
  suggestion: FilingSuggestion | null;
  error_code: string | null;
};

type FilingMode = "analysing" | "ai" | "filename" | "manual" | "failed";
type FieldSource = "ai" | "filename" | "user";

type Props = {
  scope: AiFilingScope;
  documentId: string;
  documentName: string;
  /** Prefix shown before the destination, e.g. "Private Vault" or "Agency Shared Folder". */
  destinationPrefix: string;
  /**
   * Test/override hook: a ready-made AI suggestion. Normally omitted — the popup
   * fetches the Parserly analysis itself.
   */
  suggestion?: FilingSuggestion | null;
  onClose: () => void;
  onDone: () => void;
};

type CatalogItem = { id: string; label: string };

const PATH_SEP = " → ";

function minusDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Passive provenance strip for a field: where the value came from. It carries no
 * Confirm/Edit actions — the field itself is always editable, and the badge flips
 * to "Edited by you" the moment the value is changed.
 *
 * "Suggested by AI" (with the "Where did this come from?" link) is reserved for a
 * genuine AI suggestion. A filename match shows a neutral "Suggested" badge with
 * the explanation "Based on the file name" and no provenance link. In manual or
 * failed mode nothing is labelled at all.
 */
function FieldProvenance({
  value,
  source,
  mode,
  confidence,
  sourceText,
  touched,
}: {
  value: string;
  touched: boolean;
  source: FieldSource;
  mode: FilingMode;
  confidence?: "high" | "medium" | "low" | null;
  sourceText?: string | null;
}) {
  const [showSource, setShowSource] = useState(false);
  const edited = touched && source === "user";
  const labelled = mode === "ai" || mode === "filename";

  if (!labelled) return null;
  if (source === "user" && !edited) return null;

  return (
    <div className="tvp-provenance" data-source={edited ? "user" : source}>
      <div className="tvp-provenance__head">
        <span className="tvp-provenance__value">{value}</span>
        <span className="tvp-provenance__badge">
          {edited ? (
            <>
              <Check className="h-3 w-3" /> Edited by you
            </>
          ) : source === "ai" ? (
            <>
              <Sparkles className="h-3 w-3" /> Suggested by AI
              {confidence ? ` · ${confidence} confidence` : ""}
            </>
          ) : (
            <>
              <FolderTree className="h-3 w-3" /> Suggested
            </>
          )}
        </span>
        {mode === "ai" && !edited && (
          <Button
            type="button"
            variant="ghost" className="tvp-ghost"
            data-tour="filing-source-toggle"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {showSource ? "Hide source" : "Where did this come from?"}
          </Button>
        )}
      </div>

      {mode === "filename" && !edited && (
        <p className="tvp-provenance__source">Based on the file name.</p>
      )}
      {mode === "ai" && showSource && (
        <p className="tvp-provenance__source">
          {sourceText
            ? `"${sourceText}"`
            : "The suggestion was made from the document's contents."}
        </p>
      )}
    </div>
  );
}

export function AiFilingReviewModal({
  scope,
  documentId,
  documentName,
  destinationPrefix,
  suggestion: suggestionProp,
  onClose,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const catalogFn = useServerFn(getFilingCatalog);
  const confirmFn = useServerFn(confirmDocumentFiling);
  const skipFn = useServerFn(skipDocumentFiling);
  const analysisFn = useServerFn(getDocumentAnalysis);
  const startFn = useServerFn(startDocumentAnalysis);
  const prefFn = useServerFn(setAiFilingPreference);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["filing-review", scope, documentId],
    queryFn: () => catalogFn({ data: { scope, document_id: documentId } }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const catalog: CatalogItem[] = useMemo(() => data?.catalog ?? [], [data]);

  /** The person's own switch; starts from the server, flipped by the popup link. */
  const [aiOverride, setAiOverride] = useState<boolean | null>(null);
  const preference = useQuery<{ aiEnabled: boolean }>({
    queryKey: ["ai-filing-preference"], enabled: false,
  });
  const aiEnabled = aiOverride ?? preference.data?.aiEnabled ?? (data ? data.aiEnabled !== false : false);
  const togglePending = useRef(false);
  const pollStarted = useRef(Date.now());
  const pollAttempts = useRef(0);
  const [pollStopped, setPollStopped] = useState(false);
  const resetPolling = () => {
    pollStarted.current = Date.now();
    pollAttempts.current = 0;
    setPollStopped(false);
  };

  /** Parserly analysis status — polled while queued/processing. */
  const analysisKey = ["filing-analysis", scope, documentId];
  const analysisQ = useQuery({
    queryKey: analysisKey,
    queryFn: async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > 60 || Date.now() - pollStarted.current >= 120_000) {
        return { status: "failed", suggestion: null, error_code: "poll_timeout" } as AnalysisView;
      }
      return analysisFn({ data: { scope, document_id: documentId } }) as Promise<AnalysisView>;
    },
    enabled: !!data && aiEnabled && !suggestionProp && !pollStopped && !togglePending.current,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (!pollStopped && q.state.status !== "error" && isPending((q.state.data as AnalysisView | undefined)?.status) ? 2000 : false),
  });
  useEffect(() => {
    if (!aiEnabled || suggestionProp || !data || pollStopped || analysisQ.isError || !isPending(analysisQ.data?.status) && !analysisQ.isLoading) return;
    const timer = setTimeout(() => {
      setPollStopped(true);
      void qc.cancelQueries({ queryKey: analysisKey });
    }, Math.max(0, 120_000 - (Date.now() - pollStarted.current)));
    return () => clearTimeout(timer);
  }, [aiEnabled, data, suggestionProp, pollStopped, analysisQ.isError, analysisQ.data?.status, analysisQ.isLoading, qc, scope, documentId]);
  const analysis = aiEnabled && !pollStopped && !analysisQ.isError ? (analysisQ.data as AnalysisView | undefined) : undefined;
  const status = analysis?.status ?? null;

  const aiSuggestion: FilingSuggestion | null = !aiEnabled
    ? null
    : suggestionProp
      ? suggestionProp
      : status === "completed"
        ? (analysis?.suggestion ?? null)
        : null;

  /** The filename guess is only a fallback when AI is on but Parserly is unavailable. */
  const heuristic = useMemo(
    () =>
      aiEnabled && !suggestionProp && status === "unavailable" && data
        ? suggestFromFileName(documentName, catalog)
        : null,
    [aiEnabled, suggestionProp, status, data, catalog, documentName],
  );

  const analysing =
    aiEnabled && !suggestionProp && !!data && !pollStopped && !analysisQ.isError && (analysisQ.isLoading || isPending(status));
  const analysisFailed =
    aiEnabled &&
    !suggestionProp &&
    (pollStopped || analysisQ.isError || status === "failed" || status === "unavailable");

  const mode: FilingMode = isError
    ? "failed"
    : !aiEnabled
      ? "manual"
      : aiSuggestion
        ? "ai"
        : analysing
          ? "analysing"
          : heuristic
            ? "filename"
            : analysisFailed
              ? "failed"
              : "manual";

  /**
   * The catalog arrives as flattened "Parent → Child" paths. Split it back into a
   * two-level tree so folder and subfolder can be picked separately. Agency folder
   * lists are flat, in which case every group simply has no children.
   */
  const tree = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, { ownId: string | null; children: CatalogItem[] }>();
    for (const item of catalog) {
      const parts = item.label.split(PATH_SEP);
      const top = parts[0];
      if (!groups.has(top)) {
        groups.set(top, { ownId: null, children: [] });
        order.push(top);
      }
      const group = groups.get(top);
      if (!group) continue;
      if (parts.length === 1) group.ownId = item.id;
      else group.children.push({ id: item.id, label: parts.slice(1).join(PATH_SEP) });
    }
    return { order, groups };
  }, [catalog]);

  /** Resolve a stored destination id back to its (top-level, subfolder) pair. */
  const locate = useMemo(
    () => (id: string | null) => {
      if (!id) return { top: "", sub: "" };
      for (const top of tree.order) {
        const group = tree.groups.get(top);
        if (!group) continue;
        if (group.ownId === id) return { top, sub: "" };
        if (group.children.some((c) => c.id === id)) return { top, sub: id };
      }
      return { top: "", sub: "" };
    },
    [tree],
  );

  // --- field state (all live from the moment the popup opens) ----------------
  const [topFolder, setTopFolder] = useState<string>("");
  const [subFolder, setSubFolder] = useState<string>("");
  const [expiry, setExpiry] = useState<string>("");
  /** Held as text so the field can be cleared while typing without snapping back. */
  const [leadDaysText, setLeadDaysText] = useState<string>("30");
  const [noReminder, setNoReminder] = useState(false);
  const [folderSource, setFolderSource] = useState<FieldSource>("user");
  const [expirySource, setExpirySource] = useState<FieldSource>("user");
  /** Fields the person has touched are never overwritten by a late suggestion. */
  const [folderTouched, setFolderTouched] = useState(false);
  const [expiryTouched, setExpiryTouched] = useState(false);

  const defaultLead = data?.defaultReminderDays ?? 30;

  /** Manual starting values: the upload folder (if any), no expiry, portal default lead. */
  function resetUntouchedToManual() {
    if (!folderTouched) {
      const { top, sub } = locate(data?.currentDestination ?? null);
      setTopFolder(top);
      setSubFolder(sub);
      setFolderSource("user");
    }
    if (!expiryTouched) {
      setExpiry("");
      setLeadDaysText(String(defaultLead));
      setExpirySource("user");
    }
  }

  useEffect(() => {
    if (!data) return;
    resetUntouchedToManual();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /** Apply whichever suggestion is active to the fields the person hasn't touched. */
  const active: { s: FilingSuggestion; source: FieldSource } | null = aiSuggestion
    ? { s: aiSuggestion, source: "ai" }
    : heuristic && mode === "filename"
      ? {
          s: {
            folder_id: heuristic.folder_id,
            expiry_date: heuristic.expiry_date,
            reminder_lead_days: null,
            confidence: heuristic.confidence,
            rationale: heuristic.rationale,
          },
          source: "filename",
        }
      : null;
  const activeKey = active ? `${active.source}|${active.s.folder_id}|${active.s.expiry_date}` : "none";

  useEffect(() => {
    if (!data) return;
    if (!active) {
      resetUntouchedToManual();
      return;
    }
    if (!folderTouched) {
      if (active.s.folder_id) {
        const { top, sub } = locate(active.s.folder_id);
        setTopFolder(top);
        setSubFolder(sub);
        setFolderSource(top ? active.source : "user");
      } else {
        setFolderSource("user");
      }
    }
    if (!expiryTouched) {
      setExpiry(active.s.expiry_date ?? "");
      setLeadDaysText(String(active.s.reminder_lead_days ?? defaultLead));
      setNoReminder(false);
      setExpirySource(active.s.expiry_date ? active.source : "user");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, data]);

  const touchFolder = () => {
    setFolderTouched(true);
    setFolderSource("user");
  };
  const touchExpiry = () => {
    setExpiryTouched(true);
    setExpirySource("user");
  };

  const suggestion = active?.s ?? null;

  const activeGroup = topFolder ? tree.groups.get(topFolder) : undefined;
  const subOptions = activeGroup?.children ?? [];

  /** What actually gets written: the subfolder when one is picked, else the folder. */
  const destination = subFolder || activeGroup?.ownId || null;

  const destinationLabel = topFolder
    ? [topFolder, subOptions.find((c) => c.id === subFolder)?.label].filter(Boolean).join(PATH_SEP)
    : null;

  const leadDays = Math.max(1, Math.min(365, Number(leadDaysText) || 0));
  const leadDaysValid = leadDaysText.trim() !== "" && Number(leadDaysText) >= 1;
  const reminderDate =
    expiry && !noReminder && leadDaysValid ? minusDays(expiry, leadDays) : null;

  // Without an upload folder to fall back on, a folder must be chosen unless a
  // suggestion filled one in.
  const mustChooseFolder = mode !== "ai" && mode !== "filename" && !data?.currentDestination;

  const save = useMutation({
    mutationFn: () =>
      confirmFn({
        data: {
          scope,
          document_id: documentId,
          destination,
          expires_at: expiry ? new Date(`${expiry}T00:00:00Z`).toISOString() : null,
          reminder_at: reminderDate ? new Date(`${reminderDate}T09:00:00Z`).toISOString() : null,
          // Values are only 'ai'/'filename' while that suggestion is on screen.
          folder_source: mode === "ai" || mode === "filename" ? folderSource : "user",
          expiry_source: mode === "ai" || mode === "filename" ? expirySource : "user",
          ai_assisted: mode === "ai" && (folderSource === "ai" || expirySource === "ai"),
        },
      }),
    onSuccess: () => {
      toast.success("Filing saved.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save filing."),
  });

  const skip = useMutation({
    mutationFn: () => skipFn({ data: { scope, document_id: documentId } }),
    onSuccess: () => {
      toast.success("Skipped — find it later under Pending review.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not skip this document."),
  });

  const retry = useMutation({
    mutationFn: async () => {
      await qc.cancelQueries({ queryKey: analysisKey });
      resetPolling();
      return startFn({ data: { scope, document_id: documentId } }) as Promise<AnalysisView>;
    },
    onSuccess: (view) => qc.setQueryData(analysisKey, view),
    onError: (e: any) => toast.error(e?.message ?? "Could not start the analysis."),
  });

  const toggleAi = useMutation({
    mutationFn: async (next: boolean) => {
      await prefFn({ data: { ai_filing_enabled: next } });
      await syncAiFilingPreference(qc, next);
      // Switching on from the popup runs the analysis for this document now.
      const view =
        next && !suggestionProp
          ? ((await startFn({ data: { scope, document_id: documentId } })) as AnalysisView)
          : null;
      return { next, view };
    },
    onMutate: async (next) => {
      togglePending.current = true;
      resetPolling();
      await qc.cancelQueries({ queryKey: analysisKey });
      qc.setQueryData(analysisKey, { status: "queued", suggestion: null, error_code: null });
      if (!next) {
        // Off: drop to manual immediately and discard any pending suggestion.
        setAiOverride(false);
        qc.removeQueries({ queryKey: analysisKey });
      }
    },
    onSuccess: ({ next, view }) => {
      if (view) qc.setQueryData(analysisKey, view);
      setAiOverride(null);
    },
    onSettled: () => { togglePending.current = false; },
    onError: (e: any, next) => {
      setAiOverride(null);
      toast.error(e?.message ?? "Could not change this preference.");
    },
  });

  const busy = save.isPending || skip.isPending;
  const saveDisabled = busy || (mustChooseFolder && !destination);
  const showConfidence = mode === "ai" && suggestion?.confidence;

  return (
    <DocumentModal title="Filing review" onClose={onClose} busy={busy} className="tvp-filing-modal">
        {/* Header */}
        <div className="tvp-filing-header">
          <span className="tvp-kpi-icon tvp-bg-purple">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="tvp-filing-identity">
            <h2 className="tvp-filing-title">
              {mode === "ai" ? "AI filing review" : "Filing review"}
            </h2>
            <p className="tvp-muted tvp-filing-meta">
              {documentName}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="tvp-mini-btn" title="Close" aria-label="Close" onClick={onClose} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading && (
          <div className="tvp-muted tvp-filing-note">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
            <span>Loading your folders…</span>
          </div>
        )}

        {!isLoading && mode === "analysing" && (
          <p
            className="tvp-muted tvp-filing-note"
            data-testid="filing-analysing"
          >
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
            Reading your document… You can fill in the fields yourself or skip for now.
          </p>
        )}

        {!isLoading && (isError || analysisFailed) && mode !== "ai" && mode !== "manual" && (
          <p className="tvp-muted tvp-filing-note" data-testid="filing-failed">
            Automatic analysis could not be completed. Review and file the document yourself.{" "}
            {!isError && (
              <Button
                type="button"
                variant="ghost" className="tvp-ghost"
                onClick={() => retry.mutate()}
                disabled={retry.isPending || busy}
              >
                <RotateCcw className="h-3.5 w-3.5" /> {retry.isPending ? "Retrying…" : "Retry"}
              </Button>
            )}
          </p>
        )}

        {!isLoading && data && !suggestionProp && (
          <div className="tvp-filing-meta">
            <Button
              type="button"
              variant="ghost" className="tvp-ghost"
              data-tour="filing-ai-toggle"
              onClick={() => toggleAi.mutate(!aiEnabled)}
              disabled={toggleAi.isPending || busy}
            >
              {aiEnabled ? "Turn off AI organisation" : "Turn on AI organisation"}
            </Button>
          </div>
        )}

        {!isLoading && (
          <>
            {/* ---------------- Folder & subfolder ---------------- */}
            <section className="tvp-filing-section">
              <div className="tvp-filing-section-head">
                <FolderTree className="h-4 w-4 text-primary" />
                <strong>Folder &amp; subfolder</strong>
                {showConfidence && (
                  <span
                    className="tvp-muted"
                    data-tour="filing-confidence"
                  >
                    {suggestion?.confidence} confidence
                  </span>
                )}
              </div>

              <div className="tvp-filing-fields">
                <label className="tvp-filing-field">
                  <span className="tvp-muted tvp-filing-meta">
                    {destinationPrefix} folder
                  </span>
                  <select
                    className="tvp-select"
                    data-tour="filing-folder"
                    aria-label="Destination folder"
                    value={topFolder}
                    disabled={busy}
                    onChange={(e) => {
                      setTopFolder(e.target.value);
                      setSubFolder("");
                      touchFolder();
                    }}
                  >
                    <option value="">
                      {mustChooseFolder ? "Choose a folder" : "Leave where it was uploaded"}
                    </option>
                    {tree.order.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`tvp-filing-field${subOptions.length ? "" : " tvp-field-disabled"}`}>
                  <span className="tvp-muted tvp-filing-meta">
                    Subfolder
                  </span>
                  <select
                    className="tvp-select"
                    data-tour="filing-subfolder"
                    aria-label="Destination subfolder"
                    value={subFolder}
                    disabled={busy || subOptions.length === 0}
                    onChange={(e) => {
                      setSubFolder(e.target.value);
                      touchFolder();
                    }}
                  >
                    <option value="" disabled={!activeGroup?.ownId && subOptions.length > 0}>
                      {subOptions.length === 0
                        ? "No subfolders"
                        : activeGroup?.ownId
                          ? "None — file in the main folder"
                          : "Choose a subfolder"}
                    </option>
                    {subOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="tvp-filing-note" data-testid="filing-destination">
                {destinationPrefix}: <strong>{destinationLabel ?? "Unfiled"}</strong>
              </div>

              {data?.secondaryHint && (
                <div className="tvp-muted tvp-filing-meta">
                  {data.secondaryHint}
                </div>
              )}
              {mode === "ai" && suggestion?.rationale && (
                <div className="tvp-muted tvp-filing-meta">
                  {suggestion.rationale}
                </div>
              )}

              <FieldProvenance
                value={destinationLabel ?? "Unfiled"}
                source={folderSource}
                mode={mode}
                confidence={suggestion?.confidence ?? null}
                sourceText={suggestion?.folder_source_text ?? null}
                touched={folderTouched}
              />
            </section>

            {/* ---------------- Expiry & reminder ---------------- */}
            <section className="tvp-filing-section">
              <div className="tvp-filing-section-head">
                <CalendarClock className="h-4 w-4 text-[var(--tvp-amber)]" />
                <strong>Expiry &amp; reminder</strong>
              </div>

              <div className="tvp-filing-fields">
                <label className="tvp-filing-field">
                  <span className="tvp-muted tvp-filing-meta">
                    Expiry date
                  </span>
                  <input
                    type="date"
                    className="tvp-select"
                    data-tour="filing-expiry"
                    aria-label="Expiry date"
                    value={expiry}
                    disabled={busy}
                    onChange={(e) => {
                      setExpiry(e.target.value);
                      setNoReminder(false);
                      touchExpiry();
                    }}
                  />
                </label>

                <label className={`tvp-filing-field${expiry ? "" : " tvp-field-disabled"}`}>
                  <span className="tvp-muted tvp-filing-meta">
                    Remind me this many days before
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="tvp-select"
                    data-tour="filing-reminder-days"
                    aria-label="Reminder lead days"
                    value={leadDaysText}
                    disabled={busy || noReminder || !expiry}
                    onChange={(e) => {
                      setLeadDaysText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                      touchExpiry();
                    }}
                    onBlur={() => setLeadDaysText(String(leadDays))}
                  />
                </label>
              </div>

              {expiry && (
                <label
                  className="tvp-filing-note"
                >
                  <input
                    type="checkbox"
                    checked={noReminder}
                    disabled={busy}
                    onChange={(e) => {
                      setNoReminder(e.target.checked);
                      touchExpiry();
                    }}
                  />
                  <span>No reminder needed for this document</span>
                </label>
              )}

              <div className="tvp-muted tvp-filing-meta" data-testid="reminder-summary">
                {!expiry
                  ? "No expiry set — add one above if this document has a valid-until date, and the reminder field unlocks."
                  : noReminder
                    ? "No reminder will be set."
                    : reminderDate
                      ? `Reminder on ${reminderDate}.`
                      : "Enter a lead time between 1 and 365 days to schedule a reminder."}
              </div>

              <FieldProvenance
                value={expiry ? expiry : "No expiry"}
                source={expirySource}
                mode={mode}
                confidence={suggestion?.confidence ?? null}
                sourceText={suggestion?.expiry_source_text ?? null}
                touched={expiryTouched}
              />
            </section>

            {/* ---------------- Human validation notice ---------------- */}
            <div className="tvp-muted tvp-filing-validation" data-tour="filing-validation-notice">
              <strong>Human validation required.</strong>
              <p>Suggestions are never applied automatically. Edit anything above that isn't
                right, then save — or skip for now and come back to it from the Pending review filter.</p>
            </div>

            {/* ---------------- Footer ---------------- */}
            <div className="tvp-filing-footer">
              <Button
                type="button"
                variant="outline" className="tvp-secondary"
                data-tour="filing-skip"
                title="Leave it where it was uploaded and review later"
                onClick={() => skip.mutate()}
                disabled={busy}
              >
                <Clock className="h-4 w-4" /> {skip.isPending ? "Skipping…" : "Skip for now"}
              </Button>
              <Button
                type="button"
                className="tvp-primary"
                data-tour="filing-save"
                onClick={() => save.mutate()}
                disabled={saveDisabled}
                title={saveDisabled && !busy ? "Choose a folder first" : undefined}
              >
                {save.isPending ? "Saving…" : "Save filing"}
              </Button>
            </div>
          </>
        )}
    </DocumentModal>
  );
}

export default AiFilingReviewModal;
