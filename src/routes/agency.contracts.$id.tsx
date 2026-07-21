import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, FileSignature, Receipt, Plus, Save, X, Link2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAgencyContract,
  updateAgencyContractMeta,
  createInvoiceForContract,
} from "@/lib/agency.functions";

const contractQO = (id: string) =>
  queryOptions({
    queryKey: ["agency", "contract", id],
    queryFn: () => getAgencyContract({ data: { id } }),
  });

export const Route = createFileRoute("/agency/contracts/$id")({
  head: () => ({ meta: [{ title: "Contract · TalVault" }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(contractQO(params.id));
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Contract</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
      <Link to="/agency/document-vault" className="tvp-link">← Back to Roster Shared Folder</Link>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: ContractDetail,
});

function fmtMoney(cents: number | null, ccy: string | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: ccy || "ZAR", maximumFractionDigits: 2,
  }).format(cents / 100);
}

type Tab = "overview" | "invoices";

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: c } = useSuspenseQuery(contractQO(id));
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  const updateFn = useServerFn(updateAgencyContractMeta);
  const createInvFn = useServerFn(createInvoiceForContract);

  const invoiced = c.invoices.reduce((s: number, i: any) => s + (i.totalCents ?? 0), 0);
  const paid = c.invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + i.totalCents, 0);
  const outstanding = invoiced - paid;
  const ccy = c.currency || c.invoices[0]?.currency || "ZAR";

  const [form, setForm] = useState({
    clientName: c.clientName ?? "",
    startDate: c.startDate ?? "",
    endDate: c.endDate ?? "",
    total: c.totalCents != null ? String(c.totalCents / 100) : "",
    currency: c.currency ?? "ZAR",
    notes: c.notes ?? "",
  });

  const saveMut = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: c.id,
        contract_client_name: form.clientName || null,
        contract_start_date: form.startDate || null,
        contract_end_date: form.endDate || null,
        contract_total_cents: form.total ? Math.round(parseFloat(form.total) * 100) : null,
        contract_currency: form.currency || null,
        contract_notes: form.notes || null,
      },
    }),
    onSuccess: () => {
      toast.success("Contract updated");
      qc.invalidateQueries({ queryKey: ["agency", "contract", id] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const createInvMut = useMutation({
    mutationFn: (payload: { number: string; total_cents: number; due_date: string | null; notes: string | null }) =>
      createInvFn({ data: { contract_id: c.id, ...payload } }),
    onSuccess: () => {
      toast.success("Invoice created");
      qc.invalidateQueries({ queryKey: ["agency", "contract", id] });
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      setShowInvoice(false);
      setTab("invoices");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <>
      <div className="tvp-topbar" style={{ marginBottom: 12 }}>
        <div>
          <Link to="/agency/document-vault" className="tvp-link inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />Back to Roster Shared Folder
          </Link>
          <h1 className="tvp-h1 mt-2 inline-flex items-center gap-2">
            <FileSignature className="h-6 w-6" /> {c.name}
          </h1>
          <div className="tvp-subtitle">
            Contract for <strong>{c.talentName}</strong>
            {c.clientName ? <> · Client: <strong>{c.clientName}</strong></> : null}
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary" onClick={() => setShowInvoice(true)}>
            <Plus className="h-4 w-4" />Create invoice
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="tvp-kpi-grid" style={{ marginBottom: 12 }}>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-label">Contract total</div>
          <div className="tvp-kpi-value">{fmtMoney(c.totalCents, ccy)}</div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-label">Invoiced</div>
          <div className="tvp-kpi-value">{fmtMoney(invoiced, ccy)}</div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-label">Paid</div>
          <div className="tvp-kpi-value">{fmtMoney(paid, ccy)}</div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-label">Outstanding</div>
          <div className="tvp-kpi-value">{fmtMoney(outstanding, ccy)}</div>
        </div>
      </div>

      <div className="tvp-tabs" style={{ marginBottom: 12 }}>
        <button className={`tvp-tab${tab === "overview" ? " tvp-active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`tvp-tab${tab === "invoices" ? " tvp-active" : ""}`} onClick={() => setTab("invoices")}>
          Related invoices ({c.invoices.length})
        </button>
      </div>

      {tab === "overview" && (
        <div className="tvp-card" style={{ padding: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 className="tvp-h2">Contract details</h2>
            {!editing ? (
              <button className="tvp-secondary" onClick={() => setEditing(true)}>Edit</button>
            ) : (
              <div className="flex gap-2">
                <button className="tvp-secondary" onClick={() => setEditing(false)}>Cancel</button>
                <button className="tvp-primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                  <Save className="h-4 w-4" />Save
                </button>
              </div>
            )}
          </div>
          {!editing ? (
            <div className="tvp-review-grid">
              <div className="tvp-review-item"><span className="tvp-muted tvp-small">Client</span><strong>{c.clientName || "—"}</strong></div>
              <div className="tvp-review-item"><span className="tvp-muted tvp-small">Start</span><strong>{c.startDate || "—"}</strong></div>
              <div className="tvp-review-item"><span className="tvp-muted tvp-small">End</span><strong>{c.endDate || "—"}</strong></div>
              <div className="tvp-review-item"><span className="tvp-muted tvp-small">Total</span><strong>{fmtMoney(c.totalCents, ccy)}</strong></div>
              <div className="tvp-review-item" style={{ gridColumn: "1 / -1" }}>
                <span className="tvp-muted tvp-small">Notes</span>
                <div>{c.notes || <span className="tvp-muted">No notes</span>}</div>
              </div>
            </div>
          ) : (
            <div className="tvp-form-grid">
              <div className="tvp-form-group"><label>Client</label><input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
              <div className="tvp-form-group"><label>Currency</label><input maxLength={3} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} /></div>
              <div className="tvp-form-group"><label>Start date</label><input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="tvp-form-group"><label>End date</label><input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
              <div className="tvp-form-group"><label>Total ({form.currency})</label><input type="number" step="0.01" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} /></div>
              <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Notes</label>
                <textarea rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="tvp-card">
          {c.invoices.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }} className="tvp-muted">
              No invoices linked to this contract yet.
              <div style={{ marginTop: 10 }}>
                <button className="tvp-primary" onClick={() => setShowInvoice(true)}>
                  <Plus className="h-4 w-4" />Create first invoice
                </button>
              </div>
            </div>
          ) : (
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Number</th><th>Issued</th><th>Due</th>
                  <th>Total</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {c.invoices.map((i: any) => (
                  <tr key={i.id}>
                    <td>
                      <Link2 className="inline h-4 w-4 mr-1 text-[var(--tvp-muted)]" />
                      <strong>{i.number}</strong>
                    </td>
                    <td>{i.issuedAt}</td>
                    <td>{i.dueDate ?? "—"}</td>
                    <td>{fmtMoney(i.totalCents, i.currency)}</td>
                    <td><span className={`tvp-status tvp-${i.status === "paid" ? "green" : i.status === "overdue" ? "red" : "blue"}`}>{i.status}</span></td>
                    <td>
                      <button className="tvp-secondary" onClick={() => navigate({ to: "/agency/quotes-invoices" })}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showInvoice && (
        <InvoiceDialog
          defaults={{
            number: `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`,
            total: c.totalCents ? String(c.totalCents / 100) : "",
          }}
          onClose={() => setShowInvoice(false)}
          onSave={(v) => createInvMut.mutate({
            number: v.number,
            total_cents: Math.round(parseFloat(v.total || "0") * 100),
            due_date: v.dueDate || null,
            notes: v.notes || null,
          })}
          saving={createInvMut.isPending}
        />
      )}
    </>
  );
}

function InvoiceDialog({
  defaults, onClose, onSave, saving,
}: {
  defaults: { number: string; total: string };
  onClose: () => void;
  onSave: (v: { number: string; total: string; dueDate: string; notes: string }) => void;
  saving: boolean;
}) {
  const [v, setV] = useState({ number: defaults.number, total: defaults.total, dueDate: "", notes: "" });
  return (
    <div className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-modal" onClick={e => e.stopPropagation()}>
        <div className="tvp-modal-header">
          <h3 className="tvp-h2 inline-flex items-center gap-2"><Receipt className="h-5 w-5" />New invoice for contract</h3>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="tvp-form-grid" style={{ padding: 16 }}>
          <div className="tvp-form-group"><label>Invoice number</label><input value={v.number} onChange={e => setV(s => ({ ...s, number: e.target.value }))} /></div>
          <div className="tvp-form-group"><label>Total</label><input type="number" step="0.01" value={v.total} onChange={e => setV(s => ({ ...s, total: e.target.value }))} /></div>
          <div className="tvp-form-group"><label>Due date</label><input type="date" value={v.dueDate} onChange={e => setV(s => ({ ...s, dueDate: e.target.value }))} /></div>
          <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Notes</label>
            <textarea rows={3} value={v.notes} onChange={e => setV(s => ({ ...s, notes: e.target.value }))} />
          </div>
        </div>
        <div className="tvp-modal-footer">
          <button className="tvp-secondary" onClick={onClose}>Cancel</button>
          <button className="tvp-primary" disabled={saving || !v.number} onClick={() => onSave(v)}>
            <Save className="h-4 w-4" />Create invoice
          </button>
        </div>
      </div>
    </div>
  );
}
