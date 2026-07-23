import { X, Printer, Send } from "lucide-react";
import { BillingDocument, type BillingDocAgency, type BillingDocRecord } from "./billing-document";
import type { BillingLine } from "@/lib/billing";

export function BillingPreviewDialog({
  open, onClose, doc, lines, agency, canSend, onSend, sending,
}: {
  open: boolean;
  onClose: () => void;
  doc: BillingDocRecord;
  lines: BillingLine[];
  agency: BillingDocAgency;
  canSend?: boolean;
  onSend?: () => void;
  sending?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="billing-preview-overlay"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 60, display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: 24, overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 8, maxWidth: 900, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="billing-preview-toolbar"
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 8, padding: "12px 16px", borderBottom: "1px solid #eee",
            position: "sticky", top: 0, background: "#fff", borderRadius: "8px 8px 0 0", zIndex: 1,
          }}
        >
          <div style={{ fontWeight: 700 }}>
            Preview {doc.kind === "quote" ? "quotation" : agency.is_vat_registered ? "tax invoice" : "invoice"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="tvp-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />Print / Save PDF
            </button>
            {canSend && onSend && (
              <button className="tvp-primary" onClick={onSend} disabled={sending}>
                <Send className="h-4 w-4" />{sending ? "Sending…" : "Mark as sent"}
              </button>
            )}
            <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div style={{ padding: 20, background: "#f2f1ed" }}>
          <div style={{ background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <BillingDocument doc={doc} lines={lines} agency={agency} />
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .billing-preview-overlay, .billing-preview-overlay * { visibility: visible !important; }
          .billing-preview-overlay { position: absolute !important; inset: 0 !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
          .billing-preview-toolbar { display: none !important; }
        }
      `}</style>
    </div>
  );
}
