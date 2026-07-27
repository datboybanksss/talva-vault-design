/**
 * AI Filing Review — shared popup used by BOTH the Agency Document Vault and the
 * Talent Private Vault. Shown after upload, before the document is considered filed.
 *
 * Nothing is written to the document until the user confirms both sections.
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
  Check,
  X,
  Loader2,
} from "lucide-react";
import { suggestDocumentFiling, confirmDocumentFiling } from "@/lib/ai-filing.functions";

export type AiFilingScope = "talent" | "agency";

type Props = {
  scope: AiFilingScope;
  documentId: string;
  documentName: string;
  /** Prefix shown before the destination, e.g. "Private Vault" or "Agency Shared Folder". */
  destinationPrefix: string;
  onClose: () => void;
  onDone: () => void;
};

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const STATUS_COPY: Record<string, string> = {
  no_file: "No file is attached to this document, so there is nothing to analyse.",
  unsupported:
    "This file type can't be read automatically (only images and PDFs up to 15 MB). File it manually below.",
  no_suggestion: "The document couldn't be matched to one of your folders. Pick a destination below.",
  rate_limited: "AI filing is busy right now. File this manually — you can retry later.",
  credits: "AI credits are exhausted for this workspace. File this manually.",
  error: "AI filing is unavailable right now. File this manually.",
};

export function AiFilingReviewModal({
  scope,
  documentId,
  documentName,
  destinationPrefix,
  onClose,
  onDone,
}: Props) {
  const suggestFn = useServerFn(suggestDocumentFiling);
  const confirmFn = useServerFn(confirmDocumentFiling);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ai-filing", scope, documentId],
    queryFn: () => suggestFn({ data: { scope, document_id: documentId } }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const catalog = data?.catalog ?? [];
  const suggestion = data?.suggestion ?? null;
  const defaultReminderDays = data?.defaultReminderDays ?? 30;

  // --- section state -----------------------------------------------------
  const [folderConfirmed, setFolderConfirmed] = useState(false);
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string>("");
  const [leadDays, setLeadDays] = useState<number>(defaultReminderDays);
  const [noReminder, setNoReminder] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDestination(suggestion?.folder_id ?? null);
    setExpiry(suggestion?.expiry_date ?? "");
    setLeadDays(suggestion?.reminder_lead_days ?? data.defaultReminderDays ?? 30);
    if (!suggestion?.folder_id) setPicking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const destinationLabel = useMemo(
    () => catalog.find((c: { id: string; label: string }) => c.id === destination)?.label ?? null,
    [catalog, destination],
  );

  const reminderDate = expiry && !noReminder ? addDays(expiry, leadDays) : null;

  const save = useMutation({
    mutationFn: () =>
      confirmFn({
        data: {
          scope,
          document_id: documentId,
          destination,
          expires_at: expiry ? new Date(`${expiry}T00:00:00Z`).toISOString() : null,
          reminder_at: reminderDate ? new Date(`${reminderDate}T09:00:00Z`).toISOString() : null,
          ai_assisted: Boolean(suggestion?.folder_id) && destination === suggestion?.folder_id,
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
      toast.success("AI suggestion rejected — the document stays where you put it.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reject suggestion."),
  });

  const busy = save.isPending || reject.isPending;
  const canSave = folderConfirmed && expiryConfirmed && !busy;

  const statusNote =
    data && data.status !== "ok" ? STATUS_COPY[data.status] ?? STATUS_COPY.error : null;

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
            <h2 className="tvp-h2" style={{ margin: 0 }}>
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
          <div
            className="tvp-callout"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Reading the document and checking your folders…</span>
          </div>
        )}

        {(isError || statusNote) && !isLoading && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(180, 83, 9, 0.08)",
              border: "1px solid rgba(180, 83, 9, 0.25)",
              fontSize: 13,
            }}
          >
            <ShieldAlert
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--tvp-amber, #b45309)", marginTop: 2 }}
            />
            <span>{isError ? STATUS_COPY.error : statusNote}</span>
          </div>
        )}

        {!isLoading && (
          <>
            {/* ---------------- Section 1: folder ---------------- */}
            <section className="tvp-card tvp-panel tvp-settings-tight" style={{ gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FolderTree className="h-4 w-4" style={{ color: "var(--tvp-teal, #0f766e)" }} />
                <strong style={{ fontSize: 14 }}>Suggested folder &amp; subfolder</strong>
                {suggestion?.confidence && (
                  <span className="tvp-muted" style={{ marginLeft: "auto", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {suggestion.confidence} confidence
                  </span>
                )}
              </div>

              {!picking ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
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
                    value={destination ?? ""}
                    onChange={(e) => setDestination(e.target.value || null)}
                  >
                    <option value="">Leave unfiled</option>
                    {catalog.map((c: { id: string; label: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="tvp-secondary"
                  onClick={() => {
                    setPicking((p) => !p);
                    setFolderConfirmed(false);
                  }}
                >
                  {picking ? "Use suggestion" : "Choose different folder"}
                </button>
                <button
                  type="button"
                  className={folderConfirmed ? "tvp-secondary" : "tvp-primary"}
                  onClick={() => setFolderConfirmed(true)}
                  disabled={folderConfirmed}
                >
                  {folderConfirmed ? (
                    <>
                      <Check className="h-4 w-4" /> Folder confirmed
                    </>
                  ) : (
                    "Confirm folder/subfolder"
                  )}
                </button>
              </div>
            </section>

            {/* ---------------- Section 2: expiry ---------------- */}
            <section className="tvp-card tvp-panel tvp-settings-tight" style={{ gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CalendarClock className="h-4 w-4" style={{ color: "var(--tvp-amber, #b45309)" }} />
                <strong style={{ fontSize: 14 }}>Suggested expiry &amp; reminder</strong>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                  <span className="tvp-muted" style={{ fontSize: 12 }}>
                    Expiry date
                  </span>
                  <input
                    type="date"
                    className="tvp-select"
                    value={expiry}
                    onChange={(e) => {
                      setExpiry(e.target.value);
                      setExpiryConfirmed(false);
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                  <span className="tvp-muted" style={{ fontSize: 12 }}>
                    Remind me this many days before
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="tvp-select"
                    value={leadDays}
                    disabled={noReminder || !expiry}
                    onChange={(e) => {
                      setLeadDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)));
                      setExpiryConfirmed(false);
                    }}
                  />
                </label>
              </div>

              <div className="tvp-muted" style={{ fontSize: 12 }}>
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
                  className="tvp-secondary"
                  onClick={() => {
                    setNoReminder(true);
                    setExpiryConfirmed(true);
                  }}
                >
                  No reminder needed
                </button>
                <button
                  type="button"
                  className={expiryConfirmed && !noReminder ? "tvp-secondary" : "tvp-primary"}
                  onClick={() => {
                    setNoReminder(false);
                    setExpiryConfirmed(true);
                  }}
                  disabled={expiryConfirmed && !noReminder}
                >
                  {expiryConfirmed && !noReminder ? (
                    <>
                      <Check className="h-4 w-4" /> Expiry confirmed
                    </>
                  ) : (
                    "Confirm expiry & reminder"
                  )}
                </button>
              </div>
            </section>

            {/* ---------------- Human validation notice ---------------- */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(180, 83, 9, 0.08)",
                border: "1px solid rgba(180, 83, 9, 0.25)",
                fontSize: 13,
              }}
            >
              <ShieldAlert
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--tvp-amber, #b45309)", marginTop: 2 }}
              />
              <div>
                <strong>Human validation required.</strong>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Suggestions are never applied automatically. Confirm both sections above before
                  this document is filed.
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
                className="tvp-primary"
                onClick={() => save.mutate()}
                disabled={!canSave}
              >
                {save.isPending ? "Saving…" : "Save confirmed filing"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AiFilingReviewModal;
