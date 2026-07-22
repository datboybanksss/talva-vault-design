import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Trash2, Pencil, X, Save, ArrowRightLeft, Link2,
  FileText, CheckCircle2, AlertCircle, Search,
} from "lucide-react";
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
  description: string | null;
  allow_partial_payment: boolean;
};

const listQO = queryOptions({
  queryKey: ["agency", "billing"],
  queryFn: () => listAgencyBillingDocs() as Promise<Row[]>,
});

export const Route = createFileRoute("/agency/quotes-invoices")({
  head: () => ({
    meta: [
      { title: "Quotes & Invoices · TalVault" },
      { name: "description", content: "Manage quotes and invoices for your talent roster — drafts, acceptance, and late payments in one workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
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

const STATUS_TONE: Record<Row["status"], string> = {
  draft: "neutral", sent: "blue", accepted: "green", paid: "green", overdue: "red", cancelled: "neutral",
};
const STATUS_LABEL: Record<Row["status"], string> = {
  draft: "Draft", sent: "Sent", accepted: "Accepted", paid: "Paid", overdue: "Late", cancelled: "Cancelled",
};

// Reference chips (workflow buckets, distinct from raw status enum)
type ChipKey = "quote_draft" | "invoice_draft" | "quote_sent" | "accepted" | "partial" | "late";
const CHIPS: Array<{ key: ChipKey; label: string; tone: string }> = [
  { key: "quote_draft",   label: "Quote Drafts",   tone: "teal" },
  { key: "invoice_draft", label: "Invoice Drafts", tone: "purple" },
  { key: "quote_sent",    label: "Quote Sent",     tone: "blue" },
  { key: "accepted",      label: "Accepted",       tone: "green" },
  { key: "partial",       label: "Partial",        tone: "amber" },
  { key: "late",          label: "Late",           tone: "red" },
];

function matchesChip(r: Row, key: ChipKey): boolean {
  switch (key) {
    case "quote_draft":   return r.kind === "quote"   && r.status === "draft";
    case "invoice_draft": return r.kind === "invoice" && r.status === "draft";
    case "quote_sent":    return r.kind === "quote"   && r.status === "sent";
    case "accepted":      return r.status === "accepted";
    case "partial":       return r.kind === "invoice" && r.allow_partial_payment && (r.status === "sent" || r.status === "overdue" || r.status === "paid");
    case "late":          return r.kind === "invoice" && r.status === "overdue";
  }
}

function fmtMoney(cents: number, ccy: string) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(cents / 100);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function ruleText(r: Row): string {
  if (r.kind === "quote") {
    if (r.status === "accepted") {
      return r.due_date ? "Accepted on time" : "Accepted manually";
    }
    if (r.status === "cancelled") return "Quote cancelled";
    if (r.due_date) {
      const d = daysBetween(r.issued_at, r.due_date);
      if (d <= 0) return "Acceptance deadline passed";
      return `Accept within ${d} day${d === 1 ? "" : "s"}`;
    }
    return "No acceptance deadline";
  }
  // invoice
  if (r.status === "paid") return "Paid in full";
  if (r.status === "cancelled") return "Invoice cancelled";
  if (r.allow_partial_payment) return "Partial payment allowed";
  if (r.status === "overdue" && r.due_date) {
    const d = daysBetween(r.due_date, new Date().toISOString().slice(0, 10));
    return d > 0 ? `Overdue by ${d} day${d === 1 ? "" : "s"}` : "Overdue";
  }
  if (r.due_date) {
    const d = daysBetween(r.issued_at, r.due_date);
    if (d <= 0) return "Payment due on receipt";
    if (d > 30) return `Payment due after ${d} days`;
    return `Payment due in ${d} day${d === 1 ? "" : "s"}`;
  }
  return "Payment due on receipt";
}

type EditorState = {
  id?: string;
  kind: "quote" | "invoice";
  number: string;
  description: string;
  client_name: string;
  talent_name: string;
  issued_at: string;
  due_date: string;
  currency: string;
  total_amount: string;
  status: Row["status"];
  notes: string;
  shared_with_talent: boolean;
  allow_partial_payment: boolean;
};

const emptyEditor = (kind: "quote" | "invoice"): EditorState => ({
  kind,
  number: "",
  description: "",
  client_name: "",
  talent_name: "",
  issued_at: new Date().toISOString().slice(0, 10),
  due_date: "",
  currency: "ZAR",
  total_amount: "",
  status: "draft",
  notes: "",
  shared_with_talent: false,
  allow_partial_payment: false,
});

type SortKey = "newest" | "oldest" | "amount_desc" | "amount_asc" | "due";

function QIPage() {
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(listQO);
  const upsertFn = useServerFn(upsertAgencyBillingDoc);
  const statusFn = useServerFn(updateAgencyBillingDocStatus);
  const deleteFn = useServerFn(deleteAgencyBillingDoc);
  const shareFn = useServerFn(setBillingDocShared);
  const convertFn = useServerFn(convertQuoteToInvoice);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all"); // raw status enum
  const [chipFilter, setChipFilter] = useState<ChipKey | "all">("all");
  const [talentFilter, setTalentFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor("invoice"));

  const talents = useMemo(
    () => Array.from(new Set(rows.map((r) => r.talent_name).filter((n): n is string => !!n))).sort(),
    [rows],
  );

  const chipCounts = useMemo(() => {
    const c: Record<ChipKey, number> = {
      quote_draft: 0, invoice_draft: 0, quote_sent: 0, accepted: 0, partial: 0, late: 0,
    };
    for (const r of rows) {
      for (const chip of CHIPS) if (matchesChip(r, chip.key)) c[chip.key] += 1;
    }
    return c;
  }, [rows]);

  const kpis = useMemo(() => {
    // Accepted quotes not yet converted to invoice
    const convertedQuoteIds = new Set(
      rows.filter((r) => r.kind === "invoice" && r.converted_from_quote_id).map((r) => r.converted_from_quote_id!),
    );
    const acceptedUnconverted = rows.filter(
      (r) => r.kind === "quote" && r.status === "accepted" && !convertedQuoteIds.has(r.id),
    ).length;
    return {
      quoteDrafts: chipCounts.quote_draft,
      invoiceDrafts: chipCounts.invoice_draft,
      quotesAccepted: chipCounts.accepted,
      acceptedUnconverted,
      lateInvoices: chipCounts.late,
    };
  }, [rows, chipCounts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) =>
      (typeFilter === "all" || r.kind === typeFilter) &&
      (statusFilter === "all" || r.status === statusFilter) &&
      (chipFilter === "all" || matchesChip(r, chipFilter)) &&
      (talentFilter === "all" || r.talent_name === talentFilter) &&
      (!q ||
        r.number.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||
        (r.talent_name ?? "").toLowerCase().includes(q)),
    );
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":      return a.issued_at.localeCompare(b.issued_at);
        case "amount_desc": return b.total_cents - a.total_cents;
        case "amount_asc":  return a.total_cents - b.total_cents;
        case "due":         return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
        case "newest":
        default:            return b.issued_at.localeCompare(a.issued_at);
      }
    });
    return list;
  }, [rows, typeFilter, statusFilter, chipFilter, talentFilter, search, sort]);

  const filtersActive =
    !!search || typeFilter !== "all" || statusFilter !== "all" ||
    chipFilter !== "all" || talentFilter !== "all" || sort !== "newest";

  function resetFilters() {
    setSearch(""); setTypeFilter("all"); setStatusFilter("all");
    setChipFilter("all"); setTalentFilter("all"); setSort("newest");
  }

  // Cross-references
  const quoteToInvoice = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) if (r.kind === "invoice" && r.converted_from_quote_id) m.set(r.converted_from_quote_id, r);
    return m;
  }, [rows]);
  const rowById = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(r.id, r);
    return m;
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
      description: r.description ?? "",
      client_name: r.client_name ?? "",
      talent_name: r.talent_name ?? "",
      issued_at: r.issued_at,
      due_date: r.due_date ?? "",
      currency: r.currency,
      total_amount: (r.total_cents / 100).toString(),
      status: r.status,
      notes: r.notes ?? "",
      shared_with_talent: r.shared_with_talent,
      allow_partial_payment: r.allow_partial_payment,
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
          description: editor.description.trim() || null,
          client_name: editor.client_name.trim() || null,
          talent_name: editor.talent_name.trim() || null,
          issued_at: editor.issued_at,
          due_date: editor.due_date || null,
          currency: editor.currency.toUpperCase(),
          total_cents: Math.round(amt * 100),
          status: editor.status,
          notes: editor.notes.trim() || null,
          shared_with_talent: editor.shared_with_talent,
          allow_partial_payment: editor.kind === "invoice" ? editor.allow_partial_payment : false,
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agency", "billing"] }); },
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
      <div className="tvp-topbar" style={{ alignItems: "center" }}>
        <div>
          <h1 className="tvp-h1">Quotes & Invoices</h1>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={() => openNew("quote")}><Plus className="h-4 w-4" />New Quote</button>
          <button className="tvp-primary" onClick={() => openNew("invoice")}><Plus className="h-4 w-4" />New Invoice</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="tvp-grid tvp-kpi-grid">
        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => { resetFilters(); setChipFilter("quote_draft"); }}
        >
          <div className="tvp-kpi-icon tvp-bg-teal"><Pencil className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.quoteDrafts}</div>
            <div className="tvp-kpi-label">Quote Drafts</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.quoteDrafts > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {kpis.quoteDrafts > 0 ? "Continue editing" : "Nothing in progress"}
            </div>
          </div>
        </button>

        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => { resetFilters(); setChipFilter("invoice_draft"); }}
        >
          <div className="tvp-kpi-icon tvp-bg-purple"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.invoiceDrafts}</div>
            <div className="tvp-kpi-label">Invoice Drafts</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.invoiceDrafts > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {kpis.invoiceDrafts > 0 ? "Ready to complete" : "No drafts pending"}
            </div>
          </div>
        </button>

        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => { resetFilters(); setChipFilter("accepted"); }}
        >
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.quotesAccepted}</div>
            <div className="tvp-kpi-label">Quotes Accepted</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.acceptedUnconverted > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {kpis.acceptedUnconverted > 0
                ? `${kpis.acceptedUnconverted} ready to convert`
                : "All converted"}
            </div>
          </div>
        </button>

        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => { resetFilters(); setChipFilter("late"); }}
        >
          <div className="tvp-kpi-icon tvp-bg-red"><AlertCircle className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.lateInvoices}</div>
            <div className="tvp-kpi-label">Late Invoices</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.lateInvoices > 0 ? "var(--tvp-red)" : "var(--tvp-muted)" }}>
              {kpis.lateInvoices > 0 ? "Needs follow-up" : "All on schedule"}
            </div>
          </div>
        </button>
      </div>

      {/* Workspace section */}
      <div className="tvp-card">
        <div className="tvp-panel-head" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h2 className="tvp-h2">Quotes & Invoices Workspace</h2>
          {filtersActive && (
            <button className="tvp-link" onClick={resetFilters}>Reset filters</button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3" style={{ padding: "14px 18px" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: 200 }}>
            <Search className="h-4 w-4" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tvp-muted)" }} />
            <input
              className="tvp-search"
              style={{ paddingLeft: 34, width: "100%" }}
              placeholder="Search by client, talent or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="tvp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as Row["status"][]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select className="tvp-select" value={talentFilter} onChange={(e) => setTalentFilter(e.target.value)}>
            <option value="all">All talent</option>
            {talents.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="tvp-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            <option value="quote">Quote</option>
            <option value="invoice">Invoice</option>
          </select>
          <select className="tvp-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="amount_desc">Sort: Amount ↓</option>
            <option value="amount_asc">Sort: Amount ↑</option>
            <option value="due">Sort: Due date</option>
          </select>
        </div>

        {/* Chip row */}
        <div className="tvp-life-chips" style={{ padding: "0 18px 14px" }}>
          {CHIPS.map((c) => (
            <button
              key={c.key}
              className={`tvp-life-chip${chipFilter === c.key ? " tvp-active-filter" : ""} tvp-bg-${c.tone}`}
              onClick={() => setChipFilter(chipFilter === c.key ? "all" : c.key)}
            >
              <div className="tvp-label">{c.label}</div>
              <div className="tvp-num">{chipCounts[c.key]}</div>
            </button>
          ))}
        </div>

        {/* Table */}
        <table className="tvp-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Talent</th>
              <th>Client</th>
              <th>Status</th>
              <th>Acceptance / Due Rule</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={8} className="tvp-muted" style={{ padding: 24 }}>
                {rows.length === 0
                  ? "No records yet. Click New Quote or New Invoice to create one."
                  : "No records match these filters."}
              </td></tr>
            )}
            {visible.map((r) => {
              const linkedInvoice = r.kind === "quote" ? quoteToInvoice.get(r.id) : null;
              const sourceQuote = r.kind === "invoice" && r.converted_from_quote_id ? rowById.get(r.converted_from_quote_id) : null;
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.number}</strong>
                    {r.description && (
                      <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>{r.description}</div>
                    )}
                    {(linkedInvoice || sourceQuote) && (
                      <div style={{ marginTop: 4 }}>
                        {linkedInvoice && (
                          <span className="tvp-status tvp-green" title={`Converted to invoice ${linkedInvoice.number}`}>
                            <Link2 className="h-3 w-3 inline mr-1" />→ {linkedInvoice.number}
                          </span>
                        )}
                        {sourceQuote && (
                          <span className="tvp-status tvp-blue" title={`From quote ${sourceQuote.number}`}>
                            <Link2 className="h-3 w-3 inline mr-1" />← {sourceQuote.number}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`tvp-status tvp-${r.kind === "quote" ? "teal" : "purple"}`}>
                      {r.kind === "quote" ? "Quote" : "Invoice"}
                    </span>
                  </td>
                  <td>{r.talent_name ?? "—"}</td>
                  <td>{r.client_name ?? "—"}</td>
                  <td>
                    <select
                      className={`tvp-select tvp-status-select tvp-${STATUS_TONE[r.status]}`}
                      value={r.status}
                      onChange={(e) => changeStatus.mutate({ id: r.id, status: e.target.value as Row["status"] })}
                      style={{ minWidth: 110, height: 32, fontSize: 12, fontWeight: 800 }}
                    >
                      {(Object.keys(STATUS_LABEL) as Row["status"][]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="tvp-muted" style={{ fontSize: 12 }}>{ruleText(r)}</span>
                  </td>
                  <td>{fmtMoney(r.total_cents, r.currency)}</td>
                  <td>
                    <div className="flex gap-1" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="tvp-mini-btn"
                        title={r.talent_name ? (r.shared_with_talent ? "Shared with talent — click to hide" : "Share with linked talent") : "Set a talent to enable sharing"}
                        onClick={() => r.talent_name && toggleShare.mutate({ id: r.id, shared: !r.shared_with_talent })}
                        disabled={!r.talent_name}
                        style={{ opacity: r.talent_name ? 1 : 0.4, color: r.shared_with_talent ? "var(--tvp-green)" : undefined }}
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      {r.kind === "quote" && !linkedInvoice && (
                        <button className="tvp-mini-btn" title="Convert to invoice" onClick={() => convert.mutate(r)}>
                          <ArrowRightLeft className="h-4 w-4" />
                        </button>
                      )}
                      <button className="tvp-mini-btn" title="Edit" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                      <button className="tvp-mini-btn" title="Delete" onClick={() => { if (confirm(`Delete ${r.kind} ${r.number}?`)) del.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
              <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <input
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                  placeholder="e.g. Brand campaign"
                  maxLength={200}
                />
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
                <label>{editor.kind === "quote" ? "Accept by" : "Due"}</label>
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
                  {(Object.keys(STATUS_LABEL) as Row["status"][]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="tvp-form-group" style={{ marginTop: 12 }}>
              <label>Notes</label>
              <textarea value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })} rows={3} />
            </div>
            {editor.kind === "invoice" && (
              <div className="tvp-form-group" style={{ marginTop: 12 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={editor.allow_partial_payment}
                    onChange={(e) => setEditor({ ...editor, allow_partial_payment: e.target.checked })}
                  />
                  Allow partial payment
                </label>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Displays as "Partial payment allowed" on the workspace and adds this invoice to the Partial chip.
                </div>
              </div>
            )}
            <div className="tvp-form-group" style={{ marginTop: 12 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editor.shared_with_talent}
                  onChange={(e) => setEditor({ ...editor, shared_with_talent: e.target.checked })}
                />
                Share with linked talent
              </label>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                When shared, the talent named above can view this record from their portal.
              </div>
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
