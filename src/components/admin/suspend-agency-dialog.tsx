import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function SuspendAgencyDialog({
  agencyName,
  isPending,
  onCancel,
  onConfirm,
}: {
  agencyName: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    setReason("");
  }, [agencyName]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && !isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        className="tvp-card tvp-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px, 92vw)" }}
      >
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Suspend agency</h2>
          <button className="tvp-mini-btn" onClick={onCancel} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="tvp-muted" style={{ fontSize: 12 }}>
          Suspending <strong>{agencyName}</strong> blocks active actions but preserves
          read-only access and export. The reason is recorded in the audit log.
        </p>
        <div className="tvp-form-group">
          <label>Reason (minimum 3 characters)</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Contract terminated pending review"
            autoFocus
          />
        </div>
        <div className="tvp-footer-actions">
          <button className="tvp-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="tvp-primary"
            disabled={!canSubmit}
            onClick={() => canSubmit && onConfirm(trimmed)}
          >
            {isPending ? "Suspending…" : "Suspend & log"}
          </button>
        </div>
      </div>
    </div>
  );
}
