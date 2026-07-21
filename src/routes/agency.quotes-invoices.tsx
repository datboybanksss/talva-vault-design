import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, FileSpreadsheet, Receipt, Clock, AlertTriangle, Trash2, Pencil, X, Save, ArrowRightLeft, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  listAgencyBillingDocs,
  upsertAgencyBillingDoc,
  updateAgencyBillingDocStatus,
  deleteAgencyBillingDoc,
  setBillingDocShared,
  convertQuoteToInvoice,
} from "@/lib/agency.functions";

type Row = {
  id: string;
  kind: "quote" | "invoice";
  number: string;
  client_name: string | null;
  talent_name: string | null;
  issued_at: string;
  due_date: string | null;
  currency: string;
  total_cents: number;
  status: "draft" | "sent" | "accepted" | "paid" | "overdue" | "cancelled";
  notes: string | null;
  shared_with_talent: boolean;
  converted_from_quote_id: string | null;
};

const listQO = queryOptions({
  queryKey: ["agency", "billing"],
  queryFn: () => listAgencyBillingDocs() as Promise<Row[]>,
});

export const Route = createFileRoute("/agency/quotes-invoices")({
  head: () => ({ meta: [{ title: "Quotes & Invoices · TalVault" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(listQO);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Quotes & Invoices</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: QIPage,
});

const statusTone: Record<string, string> = {
  draft: "neutral", sent: "blue", accepted: "green", paid: "green", overdue: "red", cancelled: "neutral",
};

function fmtMoney(cents: number, ccy: string) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(cents / 100);
}

type EditorState = {
  id?: string;
  kind: "quote" | "invoice";
  number: string;
  client_name: string;
  talent_name: string;
  issued_at: string;
  due_date: string;
  currency: string;
  total_amount: string;
  status: Row["status"];
  notes: string;
  shared_with_talent: boolean;
};

const emptyEditor = (kind: "quote" | "invoice"): EditorState => ({
  kind,
  number: "",
  client_name: "",
  talent_name: "",
  issued_at: new Date().toISOString().slice(0, 10),
  due_date: "",
  currency: "ZAR",
  total_amount: "",
  status: "draft",
  notes: "",
  shared_with_talent: false,
});

function QIPage() {
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(listQO);
  const upsertFn = useServerFn(upsertAgencyBillingDoc);
  const statusFn = useServerFn(updateAgencyBillingDocStatus);
  const deleteFn = useServerFn(deleteAgencyBillingDoc);
  const shareFn = useServerFn(setBillingDocShared);
  const convertFn = useServerFn(convertQuoteToInvoice);

  const [tab, setTab] = useState<"records" | "clients" | "settings">("records");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor("invoice"));

  const clients = useMemo(
    () => Array.from(new Set(rows.map((r) => r.client_name).filter((n): n is string => !!n))).sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (typeFilter === "all" || r.kind === typeFilter) &&
      (statusFilter === "all" || r.status === statusFilter) &&
      (clientFilter === "all" || r.client_name === clientFilter) &&
      (!q ||
        r.number.toLowerCase().includes(q) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||
        (r.talent_name ?? "").toLowerCase().includes(q)),
    );
  }, [rows, typeFilter, statusFilter, clientFilter, search]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    let outstanding = 0, paid30 = 0, quotesPending = 0;
    let quotesTotal = 0, quotesConverted = 0;
    for (const r of rows) {
      if (r.kind === "invoice" && (r.status === "sent" || r.status === "overdue")) outstanding += r.total_cents;
      if (r.kind === "invoice" && r.status === "paid" && now - new Date(r.issued_at).getTime() < days30) paid30 += r.total_cents;
      if (r.kind === "quote" && (r.status === "sent" || r.status === "draft")) quotesPending += r.total_cents;
      if (r.kind === "quote") {
        quotesTotal += 1;
        if (r.status === "accepted") quotesConverted += 1;
      }
    }
    const conversionRate = quotesTotal === 0 ? 0 : Math.round((quotesConverted / quotesTotal) * 100);
    return { outstanding, paid30, quotesPending, conversionRate };
  }, [rows]);

  // Build cross-reference: quote_id -> invoice row (from converted_from_quote_id)
  const quoteToInvoice = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) {
      if (r.kind === "invoice" && r.converted_from_quote_id) m.set(r.converted_from_quote_id, r);
    }
    return m;
  }, [rows]);
  const rowById = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const clientAgg = useMemo(() => {
    const map = new Map<string, { live: number; paid: number }>();
    for (const r of rows) {
      const key = r.client_name ?? "(no client)";
      const cur = map.get(key) ?? { live: 0, paid: 0 };
      if (r.status === "sent" || r.status === "draft" || r.status === "accepted" || r.status === "overdue") cur.live += 1;
      if (r.status === "paid") cur.paid += r.total_cents;
      map.set(key, cur);
    }
    return Array.from(map.entries());
  }, [rows]);

  function openNew(kind: "quote" | "invoice") {
    setEditor(emptyEditor(kind));
    setEditorOpen(true);
  }
  function openEdit(r: Row) {
    setEditor({
      id: r.id,
      kind: r.kind,
      number: r.number,
      client_name: r.client_name ?? "",
      talent_name: r.talent_name ?? "",
      issued_at: r.issued_at,
      due_date: r.due_date ?? "",
      currency: r.currency,
      total_amount: (r.total_cents / 100).toString(),
      status: r.status,
      notes: r.notes ?? "",
      shared_with_talent: r.shared_with_talent,
    });
    setEditorOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!editor.number.trim()) throw new Error("Number is required");
      const amt = Number(editor.total_amount);
      if (!Number.isFinite(amt) || amt < 0) throw new Error("Total must be a non-negative number");
      return upsertFn({
        data: {
          id: editor.id,
          kind: editor.kind,
          number: editor.number.trim(),
          client_name: editor.client_name.trim() || null,
          talent_name: editor.talent_name.trim() || null,
          issued_at: editor.issued_at,
          due_date: editor.due_date || null,
          currency: editor.currency.toUpperCase(),
          total_cents: Math.round(amt * 100),
          status: editor.status,
          notes: editor.notes.trim() || null,
          shared_with_talent: editor.shared_with_talent,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success(editor.id ? "Record updated" : "Record created");
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Row["status"] }) => statusFn({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success("Record deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const toggleShare = useMutation({
    mutationFn: ({ id, shared }: { id: string; shared: boolean }) => shareFn({ data: { id, shared } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const convert = useMutation({
    mutationFn: (quote: Row) => {
      const suggested = `INV-${new Date().getFullYear()}-${quote.number.replace(/[^0-9]/g, "").slice(-4) || "001"}`;
      const num = window.prompt(`Invoice number for conversion of ${quote.number}:`, suggested);
      if (!num) return Promise.reject(new Error("Cancelled"));
      return convertFn({ data: { quote_id: quote.id, invoice_number: num.trim() } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success("Invoice created from quote");
    },
    onError: (e: any) => { if (e.message !== "Cancelled") toast.error(e.message ?? "Conversion failed"); },
  });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Quotes & Invoices</h1>
          <div className="tvp-subtitle">Agency-side records. Talent income is captured separately in the Talent portal.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={() => openNew("quote")}>New Quote</button>
          <button className="tvp-primary" onClick={() => openNew("invoice")}><Plus className="h-4 w-4" />New Invoice</button>
        </div>
      </div>

      <div className="tvp-subtabs">
        <button className={`tvp-subtab${tab === "records" ? " tvp-active" : ""}`} onClick={() => setTab("records")}>Quotes & Invoices</button>
        <button className={`tvp-subtab${tab === "clients" ? " tvp-active" : ""}`} onClick={() => setTab("clients")}>Clients</button>
        <button className={`tvp-subtab${tab === "settings" ? " tvp-active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
      </div>

      {tab === "records" && (
        <>
          <div className="tvp-finance-grid">
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Outstanding</div><div className="tvp-amount">{fmtMoney(kpis.outstanding, "ZAR")}</div><div className="tvp-note">Sent & overdue invoices</div></div>
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Paid (30d)</div><div className="tvp-amount">{fmtMoney(kpis.paid30, "ZAR")}</div><div className="tvp-note">Invoices paid, last 30 days</div></div>
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Quotes pending</div><div className="tvp-amount">{fmtMoney(kpis.quotesPending, "ZAR")}</div><div className="tvp-note">Draft & sent quotes</div></div>
            <div className="tvp-card tvp-finance-card"><div className="tvp-label-cap">Conversion rate</div><div className="tvp-amount">{kpis.conversionRate}%</div><div className="tvp-note">Quotes accepted / total</div></div>
          </div>

          <div className="tvp-card">
            <div className="tvp-toolbar">
              <input className="tvp-search" placeholder="Search by number, client, talent…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="flex gap-2">
                <select className="tvp-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Type: All</option>
                  <option value="quote">Quote</option>
                  <option value="invoice">Invoice</option>
                </select>
                <select className="tvp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Status: All</option>
                  {Object.keys(statusTone).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="tvp-select" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                  <option value="all">Client: All</option>
                  {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <table className="tvp-table">
              <thead><tr><th>Ref</th><th>Client</th><th>Talent</th><th>Type</th><th>Status</th><th>Amount</th><th>Issued</th><th>Due</th><th>Shared</th><th>Linked</th><th></th></tr></thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={11} className="tvp-muted" style={{ padding: 24 }}>No records yet. Click New Quote or New Invoice to create one.</td></tr>
                )}
                {visible.map((r) => {
                  const linkedInvoice = r.kind === "quote" ? quoteToInvoice.get(r.id) : null;
                  const sourceQuote = r.kind === "invoice" && r.converted_from_quote_id ? rowById.get(r.converted_from_quote_id) : null;
                  return (
                  <tr key={r.id}>
                    <td><strong>{r.number}</strong></td>
                    <td>{r.client_name ?? "—"}</td>
                    <td>{r.talent_name ?? "—"}</td>
                    <td><span className={`tvp-status tvp-${r.kind === "quote" ? "blue" : "purple"}`}>{r.kind}</span></td>
                    <td>
                      <select
                        className="tvp-select"
                        value={r.status}
                        onChange={(e) => changeStatus.mutate({ id: r.id, status: e.target.value as Row["status"] })}
                        style={{ minWidth: 110 }}
                      >
                        {Object.keys(statusTone).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>{fmtMoney(r.total_cents, r.currency)}</td>
                    <td>{r.issued_at}</td>
                    <td>{r.due_date ?? "—"}</td>
                    <td>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: r.talent_name ? "pointer" : "not-allowed", opacity: r.talent_name ? 1 : 0.5 }} title={r.talent_name ? "Toggle visibility to the linked talent" : "Set a talent to enable sharing"}>
                        <input
                          type="checkbox"
                          checked={r.shared_with_talent}
                          disabled={!r.talent_name}
                          onChange={(e) => toggleShare.mutate({ id: r.id, shared: e.target.checked })}
                        />
                        <span className="tvp-muted" style={{ fontSize: 12 }}>{r.shared_with_talent ? "Shared" : "Private"}</span>
                      </label>
                    </td>
                    <td>
                      {linkedInvoice && (
                        <span className="tvp-status tvp-green" title={`Converted to invoice ${linkedInvoice.number}`}>
                          <Link2 className="h-3 w-3 inline mr-1" />{linkedInvoice.number}
                        </span>
                      )}
                      {sourceQuote && (
                        <span className="tvp-status tvp-blue" title={`From quote ${sourceQuote.number}`}>
                          <Link2 className="h-3 w-3 inline mr-1" />{sourceQuote.number}
                        </span>
                      )}
                      {!linkedInvoice && !sourceQuote && <span className="tvp-muted">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {r.kind === "quote" && !linkedInvoice && (
                          <button className="tvp-mini-btn" title="Convert to invoice" onClick={() => convert.mutate(r)}><ArrowRightLeft className="h-4 w-4" /></button>
                        )}
                        <button className="tvp-mini-btn" title="Edit" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                        <button className="tvp-mini-btn" title="Delete" onClick={() => { if (confirm(`Delete ${r.kind} ${r.number}?`)) del.mutate(r.id); }}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "clients" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Clients</h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>Derived from quotes & invoices.</span>
          </div>
          <table className="tvp-table">
            <thead><tr><th>Client</th><th>Live records</th><th>Total paid</th></tr></thead>
            <tbody>
              {clientAgg.length === 0 && (
                <tr><td colSpan={3} className="tvp-muted" style={{ padding: 24 }}>No clients yet.</td></tr>
              )}
              {clientAgg.map(([name, agg]) => (
                <tr key={name}>
                  <td><strong>{name}</strong></td>
                  <td>{agg.live}</td>
                  <td>{fmtMoney(agg.paid, "ZAR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <div className="tvp-rule-grid">
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><Clock className="inline h-4 w-4 mr-1" />Quote Acceptance</h3><p className="tvp-muted" style={{ fontSize: 12 }}>Settings persistence is not wired yet — this panel is a placeholder for a future release.</p></div>
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><Receipt className="inline h-4 w-4 mr-1" />Invoice Payment</h3><p className="tvp-muted" style={{ fontSize: 12 }}>Mark invoices overdue manually via the Status dropdown for now.</p></div>
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><AlertTriangle className="inline h-4 w-4 mr-1" />Payment capture</h3><p className="tvp-muted" style={{ fontSize: 12 }}>Full-only or partial payment tracking will be added when payment collection integrates.</p></div>
          <div className="tvp-card tvp-panel"><h3 className="tvp-h3"><FileSpreadsheet className="inline h-4 w-4 mr-1" />VAT / Tax</h3><p className="tvp-muted" style={{ fontSize: 12 }}>Enter VAT-inclusive totals for now.</p></div>
        </div>
      )}

      {editorOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditorOpen(false)}>
          <div className="tvp-card" style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <h2 className="tvp-h2">{editor.id ? "Edit record" : `New ${editor.kind}`}</h2>
              <button className="tvp-mini-btn" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="tvp-rule-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="tvp-form-group">
                <label>Type</label>
                <select value={editor.kind} onChange={(e) => setEditor({ ...editor, kind: e.target.value as "quote" | "invoice" })}>
                  <option value="quote">Quote</option>
                  <option value="invoice">Invoice</option>
                </select>
              </div>
              <div className="tvp-form-group">
                <label>Number</label>
                <input value={editor.number} onChange={(e) => setEditor({ ...editor, number: e.target.value })} placeholder="INV-2026-053" />
              </div>
              <div className="tvp-form-group">
                <label>Client</label>
                <input value={editor.client_name} onChange={(e) => setEditor({ ...editor, client_name: e.target.value })} />
              </div>
              <div className="tvp-form-group">
                <label>Talent</label>
                <input value={editor.talent_name} onChange={(e) => setEditor({ ...editor, talent_name: e.target.value })} />
              </div>
              <div className="tvp-form-group">
                <label>Issued</label>
                <input type="date" value={editor.issued_at} onChange={(e) => setEditor({ ...editor, issued_at: e.target.value })} />
              </div>
              <div className="tvp-form-group">
                <label>Due</label>
                <input type="date" value={editor.due_date} onChange={(e) => setEditor({ ...editor, due_date: e.target.value })} />
              </div>
              <div className="tvp-form-group">
                <label>Currency</label>
                <input value={editor.currency} maxLength={3} onChange={(e) => setEditor({ ...editor, currency: e.target.value.toUpperCase() })} />
              </div>
              <div className="tvp-form-group">
                <label>Total</label>
                <input type="number" min="0" step="0.01" value={editor.total_amount} onChange={(e) => setEditor({ ...editor, total_amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="tvp-form-group">
                <label>Status</label>
                <select value={editor.status} onChange={(e) => setEditor({ ...editor, status: e.target.value as Row["status"] })}>
                  {Object.keys(statusTone).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="tvp-form-group" style={{ marginTop: 12 }}>
              <label>Notes</label>
              <textarea value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })} rows={3} />
            </div>

            <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
              <button className="tvp-secondary" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="tvp-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
