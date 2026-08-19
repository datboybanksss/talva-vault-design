/**
 * Filing review popup — shared by BOTH the Agency Document Vault and the Talent
 * Private Vault. Opens after an upload completes, before the document counts as filed.
 *
 * There is no AI service wired up yet. The `suggestion` prop is the single seam:
 * it currently receives a locally-derived default (the folder chosen at upload,
 * no detected expiry), and can later be handed a real API response with the exact
 * same shape — no other change to this component or its callers.
 */

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles,
  FolderTree,
  CalendarClock,
  ShieldAlert,
  X,
  Loader2,
  Clock,
  Check,
  Pencil,
  HelpCircle,
} from "lucide-react";
import {
  getFilingCatalog,
  confirmDocumentFiling,
  skipDocumentFiling,
} from "@/lib/ai-filing.functions";

export type AiFilingScope = "talent" | "agency";

/** The shape a real suggestion service must return. */
export type FilingSuggestion = {
  /** talent: folder uuid | agency: folder name. null = no destination suggested. */
  folder_id: string | null;
  /** Detected expiry as YYYY-MM-DD, or null when none was found. */
  expiry_date: string | null;
  /** Suggested reminder lead time in days, or null to fall back to portal default. */
  reminder_lead_days: number | null;
  confidence?: "high" | "medium" | "low" | null;
  rationale?: string | null;
  /** Verbatim sentence(s) from the document the folder suggestion was drawn from. */
  folder_source_text?: string | null;
  /** Verbatim sentence(s) the expiry date was read from. */
  expiry_source_text?: string | null;
};

type Props = {
  scope: AiFilingScope;
  documentId: string;
  documentName: string;
  /** Prefix shown before the destination, e.g. "Private Vault" or "Agency Shared Folder". */
  destinationPrefix: string;
  /**
   * Suggested filing. Omit (or pass null) to fall back to the placeholder default:
   * the folder the document was uploaded into, with no expiry.
   */
  suggestion?: FilingSuggestion | null;
  onClose: () => void;
  onDone: () => void;
};

function minusDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const AMBER_PANEL = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(180, 83, 9, 0.08)",
  border: "1px solid rgba(180, 83, 9, 0.25)",
  fontSize: 13,
} as const;


/**
 * Provenance row for a single suggested field: where the value came from, how
 * confident the suggestion was, the verbatim source sentence on demand, and the
 * Confirm / Edit actions. Flips to "Edited by you" as soon as the human changes
 * or confirms ownership of the value.
 */
function FieldProvenance({
  field,
  value,
  source,
  confidence,
  sourceText,
  onConfirm,
  onEdit,
}: {
  field: string;
  value: string;
  source: "ai" | "user";
  confidence?: "high" | "medium" | "low" | null;
  sourceText?: string | null;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const confirmed = source === "user";

  return (
    <div className="tv-prov" data-source={source}>
      <div className="tv-prov__head">
        <span className="tv-prov__field">{field}</span>
        <span className="tv-prov__value">{value}</span>
        <span className="tv-prov__badge" style={{ marginLeft: "auto" }}>
          {confirmed ? (
            <>
              <Check className="h-3 w-3" /> Edited by you
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" /> Suggested by AI
              {confidence ? ` · ${confidence} confidence` : ""}
            </>
          )}
        </span>
      </div>

      {showSource && (
        <p className="tv-prov__source">
          {sourceText
            ? `"${sourceText}"`
            : confirmed
              ? "You set this value yourself, so there is no document extract behind it."
              : "No source sentence was captured for this field — the suggestion came from the folder you uploaded into, not from the document's contents."}
        </p>
      )}

      <div className="tv-prov__acts">
        <button
          type="button"
          className="tv-btn tv-btn--primary"
          onClick={onConfirm}
          disabled={confirmed}
        >
          <Check className="h-3.5 w-3.5" /> {confirmed ? "Confirmed" : "Confirm"}
        </button>
        <button type="button" className="tv-btn tv-btn--secondary" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          type="button"
          className="tv-btn tv-btn--ghost"
          onClick={() => setShowSource((v) => !v)}
          aria-expanded={showSource}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {showSource ? "Hide source" : "Where did this come from?"}
        </button>
      </div>
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
  const catalogFn = useServerFn(getFilingCatalog);
  const confirmFn = useServerFn(confirmDocumentFiling);
  const skipFn = useServerFn(skipDocumentFiling);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["filing-review", scope, documentId],
    queryFn: () => catalogFn({ data: { scope, document_id: documentId } }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const catalog = data?.catalog ?? [];

  /**
   * Placeholder suggestion until a real service is wired in: default to the folder
   * the document was uploaded into, no detected expiry, portal-default lead time.
   */
  const suggestion: FilingSuggestion | null = useMemo(() => {
    if (suggestionProp) return suggestionProp;
    if (!data) return null;
    return {
      folder_id: data.currentDestination ?? null,
      expiry_date: null,
      reminder_lead_days: data.defaultReminderDays ?? 30,
      confidence: null,
      rationale: null,
    };
  }, [suggestionProp, data]);

  // --- section state -----------------------------------------------------
  const [picking, setPicking] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string>("");
  const [leadDays, setLeadDays] = useState<number>(30);
  const [noReminder, setNoReminder] = useState(false);
  const [folderSource, setFolderSource] = useState<"ai" | "user">("ai");
  const [expirySource, setExpirySource] = useState<"ai" | "user">("ai");

  useEffect(() => {
    if (!data || !suggestion) return;
    setDestination(suggestion.folder_id);
    setExpiry(suggestion.expiry_date ?? "");
    setLeadDays(suggestion.reminder_lead_days ?? data.defaultReminderDays ?? 30);
    setFolderSource("ai");
    setExpirySource("ai");
    if (!suggestion.folder_id) setPicking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const destinationLabel = useMemo(
    () => catalog.find((c: { id: string; label: string }) => c.id === destination)?.label ?? null,
    [catalog, destination],
  );

  const reminderDate = expiry && !noReminder ? minusDays(expiry, leadDays) : null;

  const save = useMutation({
    mutationFn: () =>
      confirmFn({
        data: {
          scope,
          document_id: documentId,
          destination,
          expires_at: expiry ? new Date(`${expiry}T00:00:00Z`).toISOString() : null,
          reminder_at: reminderDate ? new Date(`${reminderDate}T09:00:00Z`).toISOString() : null,
          ai_assisted:
            Boolean(suggestionProp) && (folderSource === "ai" || expirySource === "ai"),
        },
      }),
    onSuccess: () => {
      toast.success("Filing confirmed.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save filing."),
  });

  const reject = useMutation({
    mutationFn: () =>
      confirmFn({
        data: {
          scope,
          document_id: documentId,
          destination: null,
          expires_at: null,
          reminder_at: null,
          ai_assisted: false,
        },
      }),
    onSuccess: () => {
      toast.success("Suggestion rejected — the document stays where you uploaded it.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reject suggestion."),
  });

  const skip = useMutation({
    mutationFn: () => skipFn({ data: { scope, document_id: documentId } }),
    onSuccess: () => {
      toast.success("Skipped — find it later under Pending review.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not skip this document."),
  });

  const busy = save.isPending || reject.isPending || skip.isPending;
  const canSave = !busy;

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Filing review"
        className="tvp-card"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span className="tvp-kpi-icon tvp-bg-purple" style={{ width: 34, height: 34 }}>
            <Sparkles className="h-4 w-4" />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="display-lg" style={{ fontSize: "var(--t-title)" }}>
              AI filing review
            </h2>
            <p className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
              {documentName}
            </p>
          </div>
          <button className="tvp-mini-btn" title="Close" onClick={onClose} disabled={busy}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading && (
          <div className="tvp-callout" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading your folders…</span>
          </div>
        )}

        {isError && !isLoading && (
          <div style={AMBER_PANEL}>
            <ShieldAlert
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--tvp-amber, #b45309)", marginTop: 2 }}
            />
            <span>Couldn't load your folder list. Close this and file the document manually.</span>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {/* ---------------- Section 1: folder ---------------- */}
            <section className="tvp-card tvp-panel tvp-settings-tight" style={{ gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FolderTree className="h-4 w-4" style={{ color: "var(--tvp-teal, #0f766e)" }} />
                <strong style={{ fontSize: 14 }}>Suggested folder &amp; subfolder</strong>
                {suggestion?.confidence && (
                  <span
                    className="tvp-muted"
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {suggestion.confidence} confidence
                  </span>
                )}
              </div>

              {!picking ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600 }} data-testid="filing-destination">
                    {destinationPrefix}: {destinationLabel ?? "Unfiled"}
                  </div>
                  {data?.secondaryHint && (
                    <div className="tvp-muted" style={{ fontSize: 12 }}>
                      {data.secondaryHint}
                    </div>
                  )}
                  {suggestion?.rationale && (
                    <div className="tvp-muted" style={{ fontSize: 12 }}>
                      {suggestion.rationale}
                    </div>
                  )}
                </>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="tvp-muted" style={{ fontSize: 12 }}>
                    Choose a destination
                  </span>
                  <select
                    className="tvp-select"
                    aria-label="Destination folder"
                    value={destination ?? ""}
                    onChange={(e) => {
                      setDestination(e.target.value || null);
                      setFolderSource("user");
                    }}
                  >
                    <option value="">Leave where it was uploaded</option>
                    {catalog.map((c: { id: string; label: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <FieldProvenance
                field="Folder"
                value={destinationLabel ?? "Unfiled"}
                source={folderSource}
                confidence={suggestion?.confidence ?? null}
                sourceText={suggestion?.folder_source_text ?? null}
                onConfirm={() => {
                  setFolderSource("user");
                  setPicking(false);
                }}
                onEdit={() => setPicking(true)}
              />
            </section>

            {/* ---------------- Section 2: expiry ---------------- */}
            <section className="tvp-card tvp-panel tvp-settings-tight" style={{ gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CalendarClock className="h-4 w-4" style={{ color: "var(--tvp-amber, #b45309)" }} />
                <strong style={{ fontSize: 14 }}>Suggested expiry &amp; reminder</strong>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}
                >
                  <span className="tvp-muted" style={{ fontSize: 12 }}>
                    Expiry date
                  </span>
                  <input
                    type="date"
                    className="tvp-select"
                    aria-label="Expiry date"
                    value={expiry}
                    onChange={(e) => {
                      setExpiry(e.target.value);
                      setNoReminder(false);
                      setExpirySource("user");
                    }}
                  />
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}
                >
                  <span className="tvp-muted" style={{ fontSize: 12 }}>
                    Remind me this many days before
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="tvp-select"
                    aria-label="Reminder lead days"
                    value={leadDays}
                    disabled={noReminder || !expiry}
                    onChange={(e) => {
                      setLeadDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)));
                      setExpirySource("user");
                    }}
                  />
                </label>
              </div>

              <div className="tvp-muted" style={{ fontSize: 12 }} data-testid="reminder-summary">
                {noReminder
                  ? "No reminder will be set."
                  : reminderDate
                    ? `Reminder on ${reminderDate}.`
                    : expiry
                      ? "Set a lead time to schedule a reminder."
                      : "No expiry detected on this document — add one if it has a valid-until date."}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={noReminder ? "tvp-primary" : "tvp-secondary"}
                  onClick={() => {
                    setNoReminder((v) => !v);
                    setExpirySource("user");
                  }}
                >
                  {noReminder ? "Reminder off" : "No reminder needed"}
                </button>
              </div>

              <FieldProvenance
                field="Expiry"
                value={expiry ? expiry : "No expiry"}
                source={expirySource}
                confidence={suggestion?.confidence ?? null}
                sourceText={suggestion?.expiry_source_text ?? null}
                onConfirm={() => setExpirySource("user")}
                onEdit={() =>
                  (
                    document.querySelector<HTMLInputElement>('input[aria-label="Expiry date"]')
                  )?.focus()
                }
              />
            </section>

            {/* ---------------- Human validation notice ---------------- */}
            <div style={AMBER_PANEL}>
              <ShieldAlert
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--tvp-amber, #b45309)", marginTop: 2 }}
              />
              <div>
                <strong>Human validation required.</strong>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Suggestions are never applied automatically. Review the fields above, then save
                  — or skip for now and come back to it from the Pending review filter.
                </div>
              </div>
            </div>

            {/* ---------------- Footer ---------------- */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="tvp-secondary"
                onClick={() => reject.mutate()}
                disabled={busy}
              >
                {reject.isPending ? "Rejecting…" : "Reject AI suggestion"}
              </button>
              <button
                type="button"
                className="tvp-secondary"
                title="Leave it where it was uploaded and review later"
                onClick={() => skip.mutate()}
                disabled={busy}
              >
                <Clock className="h-4 w-4" /> {skip.isPending ? "Skipping…" : "Skip for now"}
              </button>
              <button
                type="button"
                className="tvp-primary"
                onClick={() => save.mutate()}
                disabled={!canSave}
              >
                {save.isPending ? "Saving…" : "Save filing"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AiFilingReviewModal;
