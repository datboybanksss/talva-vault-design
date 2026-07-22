import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardList, Plus, CheckCircle2, AlertTriangle, XCircle, Clock, X, Save, History as HistoryIcon, Inbox, ShieldCheck, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAgencyDocumentRequests,
  getAgencyDocumentRequest,
  createAgencyDocumentRequest,
  reviewAgencyDocumentRequest,
  listAgencyTalentLinksLite,
  listAgencyRetentionRules,
} from "@/lib/agency.functions";

type Row = Awaited<ReturnType<typeof listAgencyDocumentRequests>>[number];

export const requestsListQO = queryOptions({
  queryKey: ["agency", "doc-requests"],
  queryFn: () => listAgencyDocumentRequests() as Promise<Row[]>,
});
export const requestsTalentQO = queryOptions({
  queryKey: ["agency", "vault", "talent-links"],
  queryFn: () => listAgencyTalentLinksLite(),
});

const FOLDERS = ["Contracts", "Endorsements", "Invoices", "ID Documents", "Travel", "Tax", "Other"];
const REASONS = [
  { code: "illegible", label: "Illegible / unreadable" },
  { code: "wrong_document", label: "Wrong document" },
  { code: "expired", label: "Expired / out of date" },
  { code: "incomplete", label: "Incomplete or missing pages" },
  { code: "wrong_person", label: "Wrong person" },
  { code: "other", label: "Other" },
];

function statusPill(status: string) {
  const map: Record<string, { tone: string; label: string; Icon: any }> = {
    pending: { tone: "amber", label: "Pending", Icon: Clock },
    submitted: { tone: "blue", label: "Submitted", Icon: ClipboardList },
    completed: { tone: "green", label: "Completed", Icon: CheckCircle2 },
    resubmission_required: { tone: "red", label: "Resubmission required", Icon: AlertTriangle },
    cancelled: { tone: "neutral", label: "Cancelled", Icon: XCircle },
  };
  const m = map[status] ?? map.pending;
  const Icon = m.Icon;
  return (
    <span className={`tvp-status tvp-${m.tone} inline-flex items-center gap-1`}>
      <Icon className="h-3.5 w-3.5" />{m.label}
    </span>
  );
}

export function VaultRequestsPanel({
  autoOpenNew = false,
  onAutoOpenConsumed,
}: {
  autoOpenNew?: boolean;
  onAutoOpenConsumed?: () => void;
} = {}) {
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(requestsListQO);
  const { data: talent } = useSuspenseQuery(requestsTalentQO);
  const [showNew, setShowNew] = useState(false);
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (autoOpenNew) {
      setShowNew(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenNew, onAutoOpenConsumed]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "action") return rows.filter(r => r.status === "submitted" || r.status === "pending");
    return rows.filter(r => r.status === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(() => ({
    total: rows.length,
    pending: rows.filter(r => r.status === "pending").length,
    submitted: rows.filter(r => r.status === "submitted").length,
    resub: rows.filter(r => r.status === "resubmission_required").length,
  }), [rows]);

  return (
    <>
      <div
        style={{
          marginBottom: 12,
          background: "var(--tvp-amber-bg)",
          border: "1px solid color-mix(in oklab, var(--tvp-amber) 35%, transparent)",
          borderRadius: "var(--tvp-radius-lg)",
          padding: "12px 14px",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
          <Inbox className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--tvp-amber)" }} />
          <div className="tvp-small" style={{ color: "var(--tvp-ink)" }}>
            <strong>Incoming from talent.</strong>{" "}
            <span className="tvp-muted">
              Ask a talent for a specific document, then review the submission.
              The Talent Portal isn't live yet — requests are seed-data-ready
              and will hook into talent submissions once it ships. Previous
              submissions are always retained.
            </span>
          </div>
        </div>
        <button className="tvp-accent" onClick={() => setShowNew(true)} style={{ flexShrink: 0 }}>
          <Plus className="h-4 w-4" />New request
        </button>
      </div>


      <div className="tvp-tabs" style={{ marginTop: 0, marginBottom: 12 }}>
        {[
          { key: "all", label: `All (${counts.total})` },
          { key: "action", label: `Needs action (${counts.pending + counts.submitted})` },
          { key: "submitted", label: `Submitted (${counts.submitted})` },
          { key: "resubmission_required", label: `Resubmission (${counts.resub})` },
          { key: "completed", label: "Completed" },
          { key: "cancelled", label: "Cancelled" },
        ].map(t => (
          <button
            key={t.key}
            className={`tvp-tab${statusFilter === t.key ? " tvp-active" : ""}`}
            onClick={() => setStatusFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tvp-card">
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }} className="tvp-muted">
            No document requests match this filter.
          </div>
        ) : (
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Title</th><th>Talent</th><th>Folder</th>
                <th>Due</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.title}</strong></td>
                  <td>{r.talentName}</td>
                  <td>{r.folder}</td>
                  <td className="tvp-muted">{r.dueDate ?? "—"}</td>
                  <td>{statusPill(r.status)}</td>
                  <td>
                    <button className="tvp-secondary" onClick={() => setReviewing(r)}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewRequestDialog
          talent={talent}
          onClose={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["agency", "doc-requests"] });
          }}
        />
      )}
      {reviewing && (
        <ReviewDialog
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            qc.invalidateQueries({ queryKey: ["agency", "doc-requests"] });
          }}
        />
      )}
    </>
  );
}

function NewRequestDialog({
  talent, onClose, onDone,
}: {
  talent: { id: string; displayName: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const createFn = useServerFn(createAgencyDocumentRequest);
  const [f, setF] = useState({
    talent_link_id: talent[0]?.id ?? "",
    title: "",
    folder: "ID Documents",
    instructions: "",
    due_date: "",
  });
  const mut = useMutation({
    mutationFn: () => createFn({
      data: {
        talent_link_id: f.talent_link_id,
        title: f.title,
        folder: f.folder,
        instructions: f.instructions || null,
        due_date: f.due_date || null,
      },
    }),
    onSuccess: () => { toast.success("Request created"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <div className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-modal" onClick={e => e.stopPropagation()}>
        <div className="tvp-modal-header">
          <h3 className="tvp-h2">New document request</h3>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="tvp-form-grid" style={{ padding: 16 }}>
          <div className="tvp-form-group"><label>Talent</label>
            <select value={f.talent_link_id} onChange={e => setF(s => ({ ...s, talent_link_id: e.target.value }))}>
              {talent.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
          </div>
          <div className="tvp-form-group"><label>Folder</label>
            <select value={f.folder} onChange={e => setF(s => ({ ...s, folder: e.target.value }))}>
              {FOLDERS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Title (e.g. "Updated passport scan")</label>
            <input value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} />
          </div>
          <div className="tvp-form-group"><label>Due date</label>
            <input type="date" value={f.due_date} onChange={e => setF(s => ({ ...s, due_date: e.target.value }))} />
          </div>
          <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Instructions</label>
            <textarea rows={3} value={f.instructions} onChange={e => setF(s => ({ ...s, instructions: e.target.value }))} />
          </div>
        </div>
        <div className="tvp-modal-footer">
          <button className="tvp-secondary" onClick={onClose}>Cancel</button>
          <button className="tvp-primary" disabled={!f.talent_link_id || !f.title || mut.isPending} onClick={() => mut.mutate()}>
            <Save className="h-4 w-4" />Create request
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewDialog({
  request, onClose, onDone,
}: {
  request: Row;
  onClose: () => void;
  onDone: () => void;
}) {
  const getFn = useServerFn(getAgencyDocumentRequest);
  const reviewFn = useServerFn(reviewAgencyDocumentRequest);
  const detail = useSuspenseQuery({
    queryKey: ["agency", "doc-request", request.id],
    queryFn: () => getFn({ data: { id: request.id } }),
  });
  const [outcome, setOutcome] = useState<"completed" | "resubmission_required" | "cancelled">("completed");
  const [reason, setReason] = useState<string>("illegible");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () => reviewFn({
      data: {
        id: request.id,
        outcome,
        reason_code: outcome === "resubmission_required" ? (reason as any) : undefined,
        notes: notes || undefined,
      },
    }),
    onSuccess: () => {
      toast.success(
        outcome === "completed" ? "Marked complete"
        : outcome === "resubmission_required" ? "Resubmission requested"
        : "Request cancelled"
      );
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="tvp-modal-header">
          <div>
            <h3 className="tvp-h2">Review: {request.title}</h3>
            <div className="tvp-muted tvp-small">{request.talentName} · {request.folder}</div>
          </div>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div style={{ padding: 16 }}>
          <div className="tvp-review-grid" style={{ marginBottom: 12 }}>
            <div className="tvp-review-item"><span className="tvp-muted tvp-small">Current status</span>{statusPill(request.status)}</div>
            <div className="tvp-review-item"><span className="tvp-muted tvp-small">Due</span><strong>{request.dueDate ?? "—"}</strong></div>
            <div className="tvp-review-item" style={{ gridColumn: "1 / -1" }}>
              <span className="tvp-muted tvp-small">Instructions</span>
              <div>{request.instructions || <span className="tvp-muted">None</span>}</div>
            </div>
          </div>

          <h4 className="tvp-h3">Outcome</h4>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 8 }}>
            {[
              { key: "completed", label: "Complete", icon: CheckCircle2, tone: "green" },
              { key: "resubmission_required", label: "Resubmission required", icon: AlertTriangle, tone: "amber" },
              { key: "cancelled", label: "Cancel request", icon: XCircle, tone: "red" },
            ].map(o => {
              const Icon = o.icon;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOutcome(o.key as any)}
                  className={`tvp-rule-card ${outcome === o.key ? "tvp-active" : ""}`}
                  style={{ flexDirection: "column", alignItems: "flex-start", cursor: "pointer" }}
                >
                  <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" /><strong>{o.label}</strong></span>
                </button>
              );
            })}
          </div>

          {outcome === "resubmission_required" && (
            <div className="tvp-form-group" style={{ marginTop: 12 }}>
              <label>Reason (required)</label>
              <select value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
          )}
          <div className="tvp-form-group" style={{ marginTop: 12 }}>
            <label>Notes {outcome === "resubmission_required" && <span className="tvp-muted">(shown to talent)</span>}</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <h4 className="tvp-h3" style={{ marginTop: 16 }}>
            <HistoryIcon className="inline h-4 w-4 mr-1" />Submission history
          </h4>
          {detail.data?.history.length === 0 ? (
            <p className="tvp-muted tvp-small">No prior events.</p>
          ) : (
            <div className="tvp-list" style={{ marginTop: 6 }}>
              {detail.data?.history.map((h: any) => (
                <div key={h.id} className="tvp-list-item">
                  <ClipboardList className="h-4 w-4 text-[var(--tvp-muted)]" />
                  <div>
                    <strong>{h.event.replace(/_/g, " ")}</strong>
                    {h.reason_code && <span className="tvp-muted"> · {h.reason_code}</span>}
                    <div className="tvp-muted tvp-small">
                      {new Date(h.created_at).toLocaleString()} · {h.actor_email ?? "System"}
                    </div>
                    {h.notes && <div className="tvp-small" style={{ marginTop: 4 }}>{h.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tvp-modal-footer">
          <button className="tvp-secondary" onClick={onClose}>Cancel</button>
          <button
            className="tvp-primary"
            disabled={mut.isPending || (outcome === "resubmission_required" && !reason)}
            onClick={() => mut.mutate()}
          >
            <Save className="h-4 w-4" />Submit outcome
          </button>
        </div>
      </div>
    </div>
  );
}
