import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listInvoicePayments,
  recordInvoicePayment,
  deleteInvoicePayment,
} from "@/lib/agency.functions";
import { fmtMoney } from "@/lib/billing";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records receipts against one invoice. Partial payments are first-class:
 * the invoice only moves to "paid" once the recorded payments cover the total,
 * which the database recomputes on every change.
 */
export function InvoicePaymentsDialog({
  docId,
  onClose,
}: {
  docId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvoicePayments);
  const recordFn = useServerFn(recordInvoicePayment);
  const removeFn = useServerFn(deleteInvoicePayment);

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");

  const q = useQuery({
    queryKey: ["agency", "billing", "payments", docId],
    queryFn: () => listFn({ data: { doc_id: docId } }) as Promise<any>,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agency", "billing", "payments", docId] });
    qc.invalidateQueries({ queryKey: ["agency", "billing"] });
  };

  const add = useMutation({
    mutationFn: () => {
      const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        return Promise.reject(new Error("Enter the amount received."));
      }
      return recordFn({
        data: {
          doc_id: docId,
          amount_cents: cents,
          paid_on: paidOn,
          method: method.trim() || null,
          reference: reference.trim() || null,
        },
      });
    },
    onSuccess: () => {
      setAmount("");
      setMethod("");
      setReference("");
      refresh();
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e.message ?? "The payment could not be recorded."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Payment removed");
    },
    onError: (e: any) => toast.error(e.message ?? "The payment could not be removed."),
  });

  const doc = q.data?.doc;
  const currency = doc?.currency ?? "ZAR";
  const payments: any[] = q.data?.payments ?? [];

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: 16, overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="tvp-card"
        style={{ maxWidth: 640, width: "100%", padding: 24, marginTop: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
          <h2 className="tvp-h2">Payments {doc ? `· ${doc.number}` : ""}</h2>
          <button className="tvp-mini-btn" title="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading && <div className="tvp-muted">Loading payments…</div>}

        {q.data && (
          <>
            <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              <div className="tvp-card" style={{ padding: 12 }}>
                <div className="tvp-kpi-label">Invoice total</div>
                <div className="tvp-kpi-value" style={{ fontSize: 20 }}>
                  {fmtMoney(doc.total_cents, currency)}
                </div>
              </div>
              <div className="tvp-card" style={{ padding: 12 }}>
                <div className="tvp-kpi-label">Received</div>
                <div className="tvp-kpi-value" style={{ fontSize: 20, color: "var(--tvp-green)" }}>
                  {fmtMoney(q.data.received_cents, currency)}
                </div>
              </div>
              <div className="tvp-card" style={{ padding: 12 }}>
                <div className="tvp-kpi-label">Outstanding</div>
                <div className="tvp-kpi-value" style={{ fontSize: 20 }}>
                  {fmtMoney(q.data.outstanding_cents, currency)}
                </div>
              </div>
            </div>

            <div className="tvp-rule-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="tvp-form-group">
                <label>Amount received</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 5000.00"
                />
              </div>
              <div className="tvp-form-group">
                <label>Date received</label>
                <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
              <div className="tvp-form-group">
                <label>Method (optional)</label>
                <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. EFT" />
              </div>
              <div className="tvp-form-group">
                <label>Reference (optional)</label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. Payment 1 of 2"
                />
              </div>
            </div>

            <button
              className="tvp-primary"
              style={{ marginTop: 4 }}
              disabled={add.isPending || !amount.trim()}
              onClick={() => add.mutate()}
            >
              <Plus className="h-4 w-4" />
              Record payment
            </button>

            <div className="tvp-table-wrap" style={{ marginTop: 18 }}>
              <table className="tvp-table">
                <thead>
                  <tr>
                    <th>Date received</th><th>Amount</th><th>Method</th><th>Reference</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="tvp-muted">
                        No payments recorded against this invoice yet.
                      </td>
                    </tr>
                  )}
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {new Date(p.paid_on).toLocaleDateString("en-ZA", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </td>
                      <td>{fmtMoney(p.amount_cents, currency)}</td>
                      <td>{p.method ?? "—"}</td>
                      <td>{p.reference ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="tvp-mini-btn"
                          title="Remove payment"
                          onClick={() => remove.mutate(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
