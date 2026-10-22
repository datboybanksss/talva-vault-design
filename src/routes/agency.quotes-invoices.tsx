import { FilterBar } from "@/components/shared/filter-bar";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  queryOptions,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Save,
  ArrowRightLeft,
  Link2,
  Eye,
  FileText,
  CheckCircle2,
  AlertCircle,
  Search,
  Wallet,
  Lock,
} from "lucide-react";
import { InvoicePaymentsDialog } from "@/components/agency/invoice-payments-dialog";
import { toast } from "sonner";
import { BILLING_DOC_STATUS_LABEL, BILLING_DOC_STATUS_TONE } from "@/lib/status-labels";
import {
  listAgencyBillingDocs,
  updateAgencyBillingDocStatus,
  deleteAgencyBillingDoc,
  setBillingDocShared,
  convertQuoteToInvoice,
  getBillingDocFull,
  saveAgencyBillingDocFull,
  sendAgencyBillingDoc,
  markAgencyBillingDocSentManually,
  getAgencyBillingSettings,
  listAgencyTalentLinksLite,
  linkBillingDocToTalent,
} from "@/lib/agency.functions";
import type { BillingLine } from "@/lib/billing";
import { computeTotals, emptyLine, fmtMoney } from "@/lib/billing";
import { BillingPreviewDialog } from "@/components/agency/billing-preview-dialog";
import { EmailChipsInput } from "@/components/shared/email-chips-input";
import { useAgencyClients, type AgencyClient } from "@/components/agency/clients-panel";
import { BillingSummaryCards } from "@/components/agency/billing-summary-cards";
import {
  BillingPeriodSelector,
  type PeriodState,
} from "@/components/agency/billing-period-selector";
import { BillingReportsPanel } from "@/components/agency/billing-reports-panel";
import { buildBillingReport, resolvePeriod } from "@/lib/billing-reports";

import { usePagedList } from "@/lib/pagination";
import { LoadMoreRow } from "@/components/shared/load-more";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { friendlyError } from "@/lib/friendly-error";

// Radix Select cannot hold an empty string value, so "no talent" uses a sentinel.
const NO_TALENT = "__none__";
const ONE_OFF_CLIENT = "__one_off__";

type Row = {
  id: string;
  kind: "quote" | "invoice";
  number: string;
  client_name: string | null;
  talent_name: string | null;
  talent_link_id?: string | null;
  issued_at: string;
  due_date: string | null;
  paid_at: string | null;
  currency: string;
  total_cents: number;
  status: "draft" | "sent" | "accepted" | "declined" | "partial" | "paid" | "overdue" | "cancelled";
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
  validateSearch: (search: Record<string, unknown>): { doc?: string } =>
    typeof search.doc === "string" && search.doc.trim() ? { doc: search.doc.trim() } : {},
  head: () => ({
    meta: [
      { title: "Quotes & Invoices · TalVault" },
      {
        name: "description",
        content:
          "Manage quotes and invoices for your talent roster — SARS-compliant invoicing with itemized VAT and previews.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(listQO);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Quotes & invoices</h1>
      <p className="tvp-muted">Failed to load: {(error as Error)?.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: QIPage,
});

const STATUS_TONE = BILLING_DOC_STATUS_TONE as Record<Row["status"], string>;
const STATUS_LABEL = BILLING_DOC_STATUS_LABEL as Record<Row["status"], string>;

type ChipKey = "quote_draft" | "invoice_draft" | "quote_sent" | "accepted" | "partial" | "late";
const CHIPS: Array<{ key: ChipKey; label: string; tone: string }> = [
  { key: "quote_draft", label: "Quote drafts", tone: "teal" },
  { key: "invoice_draft", label: "Invoice drafts", tone: "purple" },
  { key: "quote_sent", label: "Quotes sent", tone: "blue" },
  { key: "accepted", label: "Accepted", tone: "green" },
  { key: "partial", label: "Partial", tone: "amber" },
  { key: "late", label: "Late", tone: "red" },
];

function matchesChip(r: Row, key: ChipKey): boolean {
  switch (key) {
    case "quote_draft":
      return r.kind === "quote" && r.status === "draft";
    case "invoice_draft":
      return r.kind === "invoice" && r.status === "draft";
    case "quote_sent":
      return r.kind === "quote" && r.status === "sent";
    case "accepted":
      return r.status === "accepted";
    case "partial":
      return (
        r.kind === "invoice" &&
        (r.status === "partial" ||
          (r.allow_partial_payment &&
            (r.status === "sent" || r.status === "overdue" || r.status === "paid")))
      );
    case "late":
      return r.kind === "invoice" && r.status === "overdue";
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function ruleText(r: Row): string {
  if (r.kind === "quote") {
    if (r.status === "accepted") return r.due_date ? "Accepted on time" : "Accepted manually";
    if (r.status === "declined") return "Declined by client";
    if (r.status === "cancelled") return "Quote cancelled";
    if (r.due_date) {
      const d = daysBetween(r.issued_at, r.due_date);
      if (d <= 0) return "Acceptance deadline passed";
      return `Accept within ${d} day${d === 1 ? "" : "s"}`;
    }
    return "No acceptance deadline";
  }
  if (r.status === "paid") return "Paid in full";
  if (r.status === "partial") return "Partially paid";
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
  client_id: string | null;
  client_name: string;
  recipient_contact_person: string;
  save_client: boolean;
  talent_name: string;
  issued_at: string;
  due_date: string;
  currency: string;
  status: Row["status"];
  notes: string;
  shared_with_talent: boolean;
  allow_partial_payment: boolean;
  recipient_address: string;
  recipient_vat_number: string;
  recipient_emails: string[];
  acceptance_window_days: string;
  payment_terms_days: string;
  lines: BillingLine[];
};

function emptyEditor(
  kind: "quote" | "invoice",
  defaultVatBp = 1500,
  defaultAcceptDays = 14,
  defaultPayDays = 30,
): EditorState {
  return {
    kind,
    number: "",
    description: "",
    client_id: null,
    client_name: "",
    recipient_contact_person: "",
    save_client: false,
    talent_name: "",
    issued_at: new Date().toISOString().slice(0, 10),
    due_date: "",
    currency: "ZAR",
    status: "draft",
    notes: "",
    shared_with_talent: false,
    allow_partial_payment: false,
    recipient_address: "",
    recipient_vat_number: "",
    recipient_emails: [],
    acceptance_window_days: kind === "quote" ? String(defaultAcceptDays) : "",
    payment_terms_days: kind === "invoice" ? String(defaultPayDays) : "",
    lines: [emptyLine(0, defaultVatBp)],
  };
}

type SortKey = "newest" | "oldest" | "amount_desc" | "amount_asc" | "due";

function QIPage() {
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(listQO);
  const saveFn = useServerFn(saveAgencyBillingDocFull);
  const sendFn = useServerFn(sendAgencyBillingDoc);
  const markSentFn = useServerFn(markAgencyBillingDocSentManually);
  const statusFn = useServerFn(updateAgencyBillingDocStatus);
  const deleteFn = useServerFn(deleteAgencyBillingDoc);
  const shareFn = useServerFn(setBillingDocShared);
  const convertFn = useServerFn(convertQuoteToInvoice);
  const getFullFn = useServerFn(getBillingDocFull);
  const getSettingsFn = useServerFn(getAgencyBillingSettings);

  const { data: settings } = useQuery({
    queryKey: ["agency", "billing-settings"],
    queryFn: () => getSettingsFn(),
  });

  // Talent field is bound to the real roster so "Share with linked talent"
  // and the talent's own Budget & Income view always resolve.
  const { data: clientsData } = useAgencyClients();
  const savedClients: AgencyClient[] = clientsData?.clients ?? [];

  const rosterFn = useServerFn(listAgencyTalentLinksLite);
  const { data: rosterData } = useQuery({
    queryKey: ["agency", "talent-links-lite"],
    queryFn: () => rosterFn(),
  });
  const roster = useMemo(
    () => (rosterData ?? []).filter((t: any) => t.status !== "revoked"),
    [rosterData],
  );
  const rosterNames = useMemo(
    () => new Set(roster.map((t: any) => t.displayName.trim().toLowerCase())),
    [roster],
  );

  const linkFn = useServerFn(linkBillingDocToTalent);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const linkDoc = useMutation({
    mutationFn: (v: { doc_id: string; talent_link_id: string }) => linkFn({ data: v }),
    onSuccess: () => {
      toast.success("Linked to talent.");
      setLinkingId(null);
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't link this document.")),
  });
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentsDocId, setPaymentsDocId] = useState<string | null>(null);
  const [chipFilter, setChipFilter] = useState<ChipKey | "all">("all");
  const [talentFilter, setTalentFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const { doc: docParam } = Route.useSearch();
  const [search, setSearch] = useState(docParam ?? "");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor("invoice"));
  const [loadingEditor, setLoadingEditor] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);

  const [view, setView] = useState<"overview" | "reports">("overview");
  const [period, setPeriod] = useState<PeriodState>({
    key: "this_month",
    custom: { from: "", to: "" },
  });

  const talents = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.talent_name).filter((n): n is string => !!n))).sort(),
    [rows],
  );

  const chipCounts = useMemo(() => {
    const c: Record<ChipKey, number> = {
      quote_draft: 0,
      invoice_draft: 0,
      quote_sent: 0,
      accepted: 0,
      partial: 0,
      late: 0,
    };
    for (const r of rows) for (const chip of CHIPS) if (matchesChip(r, chip.key)) c[chip.key] += 1;
    return c;
  }, [rows]);

  const kpis = useMemo(() => {
    const convertedQuoteIds = new Set(
      rows
        .filter((r) => r.kind === "invoice" && r.converted_from_quote_id)
        .map((r) => r.converted_from_quote_id!),
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

  // Live financial reporting — every figure derived from the real billing records
  // for the selected period, using real calendar maths against today's date.
  const resolvedPeriod = useMemo(
    () => resolvePeriod(period.key, period.custom, new Date()),
    [period.key, period.custom],
  );
  const report = useMemo(
    () => buildBillingReport(rows, resolvedPeriod, new Date()),
    [rows, resolvedPeriod],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter(
      (r) =>
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
        case "oldest":
          return a.issued_at.localeCompare(b.issued_at);
        case "amount_desc":
          return b.total_cents - a.total_cents;
        case "amount_asc":
          return a.total_cents - b.total_cents;
        case "due":
          return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
        case "newest":
        default:
          return b.issued_at.localeCompare(a.issued_at);
      }
    });
    return list;
  }, [rows, typeFilter, statusFilter, chipFilter, talentFilter, search, sort]);

  const page = usePagedList(filteredRows, {
    resetKey: `${typeFilter}|${statusFilter}|${chipFilter}|${talentFilter}|${search}|${sort}`,
  });
  const visible = page.visible;

  const filtersActive =
    !!search ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    chipFilter !== "all" ||
    talentFilter !== "all" ||
    sort !== "newest";

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setChipFilter("all");
    setTalentFilter("all");
    setSort("newest");
  }

  const quoteToInvoice = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows)
      if (r.kind === "invoice" && r.converted_from_quote_id) m.set(r.converted_from_quote_id, r);
    return m;
  }, [rows]);
  const rowById = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  function openNew(kind: "quote" | "invoice") {
    setEditor(
      emptyEditor(
        kind,
        settings?.default_vat_rate_bp ?? 1500,
        settings?.default_quote_acceptance_days ?? 14,
        settings?.default_invoice_payment_days ?? 30,
      ),
    );
    setEditorOpen(true);
  }

  async function openEdit(r: Row) {
    setLoadingEditor(true);
    setEditorOpen(true);
    try {
      const full = await getFullFn({ data: { id: r.id } });
      const lines: BillingLine[] = (full.lines ?? []).map((l: any, i: number) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price_cents: l.unit_price_cents,
        vat_rate_bp: l.vat_rate_bp,
        sort_order: l.sort_order ?? i,
      }));
      setEditor({
        id: full.doc.id,
        kind: full.doc.kind,
        number: full.doc.number,
        description: full.doc.description ?? "",
        client_id: (full.doc.client_id as string | null) ?? null,
        client_name: full.doc.client_name ?? "",
        recipient_contact_person: full.doc.recipient_contact_person ?? "",
        save_client: false,
        talent_name: full.doc.talent_name ?? "",
        issued_at: full.doc.issued_at,
        due_date: full.doc.due_date ?? "",
        currency: full.doc.currency,
        status: full.doc.status,
        notes: full.doc.notes ?? "",
        shared_with_talent: !!full.doc.shared_with_talent,
        allow_partial_payment: !!full.doc.allow_partial_payment,
        recipient_address: full.doc.recipient_address ?? "",
        recipient_vat_number: full.doc.recipient_vat_number ?? "",
        recipient_emails:
          (full.doc.recipient_emails as string[] | null) ??
          (full.doc.recipient_email ? [full.doc.recipient_email] : []),
        acceptance_window_days: full.doc.acceptance_window_days
          ? String(full.doc.acceptance_window_days)
          : "",
        payment_terms_days: full.doc.payment_terms_days ? String(full.doc.payment_terms_days) : "",
        lines: lines.length > 0 ? lines : [emptyLine(0, settings?.default_vat_rate_bp ?? 1500)],
      });
    } catch (e: any) {
      toast.error(friendlyError(e, "Failed to load record"));
      setEditorOpen(false);
    } finally {
      setLoadingEditor(false);
    }
  }

  const sendFromLabel = useMemo(() => {
    const s: any = settings;
    const verified = !!s?.billing_from_verified_at && !!s?.billing_from_email;
    const name = (verified && s?.billing_from_name) || s?.name || "TalVault";
    return verified
      ? `${name} (replies to ${s.billing_from_email})`
      : `${name} (TalVault system address — verify your own address in Settings)`;
  }, [settings]);

  const editorTotals = useMemo(() => computeTotals(editor.lines), [editor.lines]);

  /** Issued documents are financial records — the money no longer moves. */
  const financialsLocked = !!editor.id && editor.status !== "draft";

  const save = useMutation({
    mutationFn: async () => {
      const validLines = editor.lines.filter((l) => l.description.trim());
      if (validLines.length === 0) throw new Error("Add at least one line item with a description");
      return saveFn({
        data: {
          id: editor.id,
          kind: editor.kind,
          number: editor.number.trim() || undefined,
          client_id: editor.client_id,
          client_name: editor.client_name.trim() || null,
          recipient_contact_person: editor.recipient_contact_person.trim() || null,
          save_client: editor.save_client && !editor.client_id,
          talent_name: editor.talent_name.trim() || null,
          description: editor.description.trim() || null,
          issued_at: editor.issued_at,
          due_date: editor.due_date || null,
          currency: editor.currency.toUpperCase(),
          status: editor.status,
          notes: editor.notes.trim() || null,
          shared_with_talent: editor.shared_with_talent,
          allow_partial_payment: editor.kind === "invoice" ? editor.allow_partial_payment : false,
          recipient_address: editor.recipient_address.trim() || null,
          recipient_vat_number: editor.recipient_vat_number.trim() || null,
          recipient_email: editor.recipient_emails[0] ?? null,
          recipient_emails: editor.recipient_emails,
          acceptance_window_days:
            editor.kind === "quote" && editor.acceptance_window_days
              ? Number(editor.acceptance_window_days)
              : null,
          payment_terms_days:
            editor.kind === "invoice" && editor.payment_terms_days
              ? Number(editor.payment_terms_days)
              : null,
          lines: validLines.map((l, i) => ({
            id: l.id,
            description: l.description.trim(),
            quantity: Number(l.quantity) || 0,
            unit_price_cents: Math.round(Number(l.unit_price_cents) || 0),
            vat_rate_bp: Math.round(Number(l.vat_rate_bp) || 0),
            sort_order: i,
          })),
        },
      });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success(editor.id ? "Record updated" : "Record created");
      setEditor((prev) => ({ ...prev, id: res.id }));
    },
    onError: (e: any) => toast.error(friendlyError(e, "Save failed")),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!editor.id) throw new Error("Save the record first");
      if (editor.recipient_emails.length === 0)
        throw new Error("Add at least one recipient email address");
      return sendFn({ data: { id: editor.id, recipients: editor.recipient_emails } });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      const delivered = (res.delivery ?? []).filter((d: any) => d.sent).length;
      const total = (res.delivery ?? []).length;
      toast.success(
        total
          ? `${res.number} sent to ${delivered} of ${total} recipient${total === 1 ? "" : "s"}`
          : `Marked as sent — ${res.number}`,
      );
      setEditor((prev) => ({ ...prev, number: res.number, status: "sent" }));
      setPreviewOpen(false);
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to send")),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Row["status"] }) =>
      statusFn({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed")),
  });

  const markPreviewSent = useMutation({
    mutationFn: async () => {
      if (!editor.id) throw new Error("Save the record first");
      return markSentFn({ data: { id: editor.id } });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success(`${editor.kind === "quote" ? "Quotation" : "Invoice"} marked as sent manually`);
      setEditor((prev) => ({ ...prev, number: res.number, status: "sent" }));
      setPreviewOpen(false);
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(friendlyError(e, "Could not update this record")),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
      toast.success("Record deleted");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Delete failed")),
  });

  const toggleShare = useMutation({
    mutationFn: ({ id, shared }: { id: string; shared: boolean }) =>
      shareFn({ data: { id, shared } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "billing"] });
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed")),
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
    onError: (e: any) => {
      if (e.message !== "Cancelled") toast.error(friendlyError(e, "Conversion failed"));
    },
  });

  function updateLine(idx: number, patch: Partial<BillingLine>) {
    setEditor((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }
  function addLine() {
    setEditor((prev) => ({
      ...prev,
      lines: [...prev.lines, emptyLine(prev.lines.length, settings?.default_vat_rate_bp ?? 1500)],
    }));
  }
  function removeLine(idx: number) {
    setEditor((prev) => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter((_, i) => i !== idx) : prev.lines,
    }));
  }

  const previewAgency = settings
    ? {
        name: settings.name,
        contact_email: settings.contact_email,
        phone: settings.phone,
        country: settings.country,
        business_type: settings.business_type,
        billing_address: settings.billing_address,
        is_vat_registered: settings.is_vat_registered,
        vat_number: settings.vat_number,
        main_contact_first_name: settings.main_contact_first_name,
        main_contact_last_name: settings.main_contact_last_name,
        main_contact_email: settings.main_contact_email,
        main_contact_phone: settings.main_contact_phone,
        logo_url: settings.logo_url,
        accent_color: settings.accent_color,
        default_invoice_payment_days: settings.default_invoice_payment_days,
        default_quote_acceptance_days: settings.default_quote_acceptance_days,
        bank_name: (settings as any).bank_name ?? null,
        bank_account_holder: (settings as any).bank_account_holder ?? null,
        bank_account_number: (settings as any).bank_account_number ?? null,
        bank_branch_code: (settings as any).bank_branch_code ?? null,
        payment_instructions: (settings as any).payment_instructions ?? null,
      }
    : null;

  return (
    <>
      <div className="tvp-topbar" style={{ alignItems: "center" }}>
        <div>
          <h1 className="tvp-h1">Quotes & invoices</h1>
        </div>
        <div className="tvp-actions" data-tour="billing-new">
          <button className="tvp-secondary" onClick={() => openNew("quote")}>
            <Plus className="h-4 w-4" />
            New Quote
          </button>
          <button className="tvp-primary" onClick={() => openNew("invoice")}>
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </div>
      </div>

      <div className="tvp-subtabs" data-tour="billing-subtabs">
        <button
          className={`tvp-subtab${view === "overview" ? " tvp-active" : ""}`}
          onClick={() => setView("overview")}
        >
          Overview
        </button>
        <button
          className={`tvp-subtab${view === "reports" ? " tvp-active" : ""}`}
          onClick={() => setView("reports")}
        >
          Reports
        </button>
      </div>

      {view === "reports" ? (
        <BillingReportsPanel
          report={report}
          period={period}
          onPeriodChange={setPeriod}
          agencyName={settings?.name ?? "Your agency"}
        />
      ) : (
        <>
          <div className="tvp-card" style={{ marginBottom: 14 }}>
            <BillingPeriodSelector
              value={period}
              onChange={setPeriod}
              label={resolvedPeriod.label}
            />
          </div>

          <div data-tour="billing-summary">
            <BillingSummaryCards report={report} />
          </div>

          <div className="tvp-grid tvp-kpi-grid">
            <button
              className="tvp-card tvp-kpi tvp-clickable"
              onClick={() => {
                resetFilters();
                setChipFilter("quote_draft");
              }}
            >
              <div className="tvp-kpi-icon tvp-bg-teal">
                <Pencil className="h-5 w-5" />
              </div>
              <div>
                <div className="tvp-kpi-value">{kpis.quoteDrafts}</div>
                <div className="tvp-kpi-label">Quote drafts</div>
                <div
                  className="tvp-kpi-sub"
                  style={{ color: kpis.quoteDrafts > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}
                >
                  {kpis.quoteDrafts > 0 ? "Continue editing" : "Nothing in progress"}
                </div>
              </div>
            </button>
            <button
              className="tvp-card tvp-kpi tvp-clickable"
              onClick={() => {
                resetFilters();
                setChipFilter("invoice_draft");
              }}
            >
              <div className="tvp-kpi-icon tvp-bg-purple">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="tvp-kpi-value">{kpis.invoiceDrafts}</div>
                <div className="tvp-kpi-label">Invoice drafts</div>
                <div
                  className="tvp-kpi-sub"
                  style={{
                    color: kpis.invoiceDrafts > 0 ? "var(--tvp-green)" : "var(--tvp-muted)",
                  }}
                >
                  {kpis.invoiceDrafts > 0 ? "Ready to complete" : "No drafts pending"}
                </div>
              </div>
            </button>
            <button
              className="tvp-card tvp-kpi tvp-clickable"
              onClick={() => {
                resetFilters();
                setChipFilter("accepted");
              }}
            >
              <div className="tvp-kpi-icon tvp-bg-green">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="tvp-kpi-value">{kpis.quotesAccepted}</div>
                <div className="tvp-kpi-label">Quotes accepted</div>
                <div
                  className="tvp-kpi-sub"
                  style={{
                    color: kpis.acceptedUnconverted > 0 ? "var(--tvp-green)" : "var(--tvp-muted)",
                  }}
                >
                  {kpis.acceptedUnconverted > 0
                    ? `${kpis.acceptedUnconverted} ready to convert`
                    : "All converted"}
                </div>
              </div>
            </button>
            <button
              className="tvp-card tvp-kpi tvp-clickable"
              onClick={() => {
                resetFilters();
                setChipFilter("late");
              }}
            >
              <div className="tvp-kpi-icon tvp-bg-red">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="tvp-kpi-value">{kpis.lateInvoices}</div>
                <div className="tvp-kpi-label">Late invoices</div>
                <div
                  className="tvp-kpi-sub"
                  style={{ color: kpis.lateInvoices > 0 ? "var(--tvp-red)" : "var(--tvp-muted)" }}
                >
                  {kpis.lateInvoices > 0 ? "Needs follow-up" : "All on schedule"}
                </div>
              </div>
            </button>
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Quotes and invoices</h2>
            </div>

            <FilterBar
              search={{ value: search, onChange: setSearch, placeholder: "Search by client, talent or reference" }}
              active={filtersActive}
              onClear={resetFilters}
              onChange={(k, v) => (k === "status" ? setStatusFilter(v) : k === "talent" ? setTalentFilter(v) : k === "type" ? setTypeFilter(v) : setSort(v as SortKey))}
              filters={[
                { key: "status", label: "Status", value: statusFilter, options: [{ value: "all", label: "All statuses" }, ...(Object.keys(STATUS_LABEL) as Row["status"][]).map((x) => ({ value: x, label: STATUS_LABEL[x] }))] },
                { key: "talent", label: "Talent", value: talentFilter, options: [{ value: "all", label: "All talent" }, ...talents.map((t) => ({ value: t, label: t }))] },
                { key: "type", label: "Type", value: typeFilter, options: [{ value: "all", label: "All types" }, { value: "quote", label: "Quote" }, { value: "invoice", label: "Invoice" }] },
                { key: "sort", label: "Sort", value: sort, options: [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "amount_desc", label: "Highest amount" }, { value: "amount_asc", label: "Lowest amount" }, { value: "due", label: "Due date" }] },
              ]}
            />

            <div className="tvp-life-chips">
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

            <div className="tvp-table-wrap">
            <table className="tvp-table" data-tour="billing-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Talent</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Acceptance or due</th>
                  <th className="tvp-num">Amount</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="tvp-muted" style={{ padding: 24 }}>
                      {rows.length === 0
                        ? "No quotes or invoices yet. Start with New quote or New invoice."
                        : "No quotes or invoices match these filters."}
                    </td>
                  </tr>
                )}
                {visible.map((r) => {
                  const linkedInvoice = r.kind === "quote" ? quoteToInvoice.get(r.id) : null;
                  const sourceQuote =
                    r.kind === "invoice" && r.converted_from_quote_id
                      ? rowById.get(r.converted_from_quote_id)
                      : null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.number}</strong>
                        {r.description && (
                          <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {r.description}
                          </div>
                        )}
                        {(linkedInvoice || sourceQuote) && (
                          <div style={{ marginTop: 4 }}>
                            {linkedInvoice && (
                              <span
                                className="tvp-status tvp-green"
                                title={`Converted to invoice ${linkedInvoice.number}`}
                              >
                                <Link2 className="h-3 w-3 inline mr-1" />→ {linkedInvoice.number}
                              </span>
                            )}
                            {sourceQuote && (
                              <span
                                className="tvp-status tvp-blue"
                                title={`From quote ${sourceQuote.number}`}
                              >
                                <Link2 className="h-3 w-3 inline mr-1" />← {sourceQuote.number}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`tvp-status tvp-${r.kind === "quote" ? "teal" : "purple"}`}
                        >
                          {r.kind === "quote" ? "Quote" : "Invoice"}
                        </span>
                      </td>
                      <td>
                        {r.talent_name ?? "—"}
                        {!r.talent_link_id && (
                          <div
                            style={{
                              marginTop: 4,
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              className="tvp-status tvp-amber"
                              title="Not linked to a talent on your roster, so the talent may not see it"
                            >
                              Not linked
                            </span>
                            {linkingId === r.id ? (
                              <select
                                className="tvp-select"
                                style={{ height: 28, fontSize: 12 }}
                                defaultValue=""
                                disabled={linkDoc.isPending}
                                onChange={(e) =>
                                  e.target.value &&
                                  linkDoc.mutate({ doc_id: r.id, talent_link_id: e.target.value })
                                }
                                onBlur={() => !linkDoc.isPending && setLinkingId(null)}
                                autoFocus
                              >
                                <option value="" disabled>
                                  Choose talent…
                                </option>
                                {roster.map((t: any) => (
                                  <option key={t.id} value={t.id}>
                                    {t.displayName}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                className="tvp-link"
                                style={{ fontSize: 12 }}
                                onClick={() => setLinkingId(r.id)}
                              >
                                Link to talent
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td>{r.client_name ?? "—"}</td>
                      <td>
                        <select
                          className={`tvp-select tvp-status-select tvp-${STATUS_TONE[r.status]}`}
                          value={r.status}
                          onChange={(e) =>
                            changeStatus.mutate({
                              id: r.id,
                              status: e.target.value as Row["status"],
                            })
                          }
                          style={{ minWidth: 110, height: 32, fontSize: 12, fontWeight: 800 }}
                        >
                          {(Object.keys(STATUS_LABEL) as Row["status"][]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className="tvp-muted" style={{ fontSize: 12 }}>
                          {ruleText(r)}
                        </span>
                      </td>
                      <td className="tvp-num">{fmtMoney(r.total_cents, r.currency)}</td>
                      <td className="tvp-actions-cell">
                        <RowActionsMenu
                          label={`Actions for ${r.number}`}
                          actions={[
                            { key: "edit", label: "Edit", icon: Pencil, onSelect: () => openEdit(r) },
                            r.kind === "quote" && !linkedInvoice && {
                              key: "convert",
                              label: "Convert to invoice",
                              icon: ArrowRightLeft,
                              onSelect: () => convert.mutate(r),
                            },
                            r.kind === "invoice" && r.status !== "draft" && {
                              key: "payments",
                              label: "Payments received",
                              icon: Wallet,
                              onSelect: () => setPaymentsDocId(r.id),
                            },
                            !!r.talent_name && {
                              key: "share",
                              label: r.shared_with_talent ? "Stop sharing with talent" : "Share with linked talent",
                              icon: Link2,
                              onSelect: () => toggleShare.mutate({ id: r.id, shared: !r.shared_with_talent }),
                            },
                            {
                              key: "delete",
                              label: "Delete",
                              icon: Trash2,
                              destructive: true,
                              separatorBefore: true,
                              onSelect: () => {
                                if (confirm(`Delete ${r.kind} ${r.number}?`)) del.mutate(r.id);
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
                <LoadMoreRow
                  colSpan={8}
                  noun="documents"
                  shown={page.shown}
                  total={page.total}
                  hasMore={page.hasMore}
                  onLoadMore={page.loadMore}
                />
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {paymentsDocId && (
        <InvoicePaymentsDialog docId={paymentsDocId} onClose={() => setPaymentsDocId(null)} />
      )}

      {editorOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="tvp-card"
            style={{
              maxWidth: 820,
              width: "100%",
              maxHeight: "92vh",
              overflow: "auto",
              padding: 24,
              marginTop: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <h2 className="tvp-h2">{editor.id ? `Edit ${editor.kind}` : `New ${editor.kind}`}</h2>
              <button title="Close" className="tvp-mini-btn" onClick={() => setEditorOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingEditor ? (
              <div className="tvp-muted" style={{ padding: 32, textAlign: "center" }}>
                Loading…
              </div>
            ) : (
              <>
                {financialsLocked && (
                  <div
                    className="tvp-ai-box"
                    style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}
                  >
                    <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="tvp-small">
                      {editor.number} has already been issued, so its number, amounts, dates and
                      line items are fixed. You can still update the notes, sharing and status — to
                      change the money, cancel this one and raise a new {editor.kind}.
                    </div>
                  </div>
                )}
                <div className="tvp-form-2col">
                  <div className="tvp-form-group">
                    <label>Type</label>
                    <select
                      value={editor.kind}
                      onChange={(e) =>
                        setEditor({ ...editor, kind: e.target.value as "quote" | "invoice" })
                      }
                      disabled={!!editor.id}
                    >
                      <option value="quote">Quote</option>
                      <option value="invoice">Invoice</option>
                    </select>
                  </div>
                  <div className="tvp-form-group">
                    <label>
                      Number{" "}
                      {!editor.number && (
                        <span className="tvp-muted" style={{ fontSize: 11 }}>
                          (auto on send)
                        </span>
                      )}
                    </label>
                    <input
                      value={editor.number}
                      disabled={financialsLocked}
                      onChange={(e) => setEditor({ ...editor, number: e.target.value })}
                      placeholder={editor.kind === "quote" ? "QT-2026-0001" : "INV-2026-0001"}
                    />
                  </div>
                  <div
                    className="tvp-form-group"
                    data-tour="editor-ref"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <label>Reference / description</label>
                    <input
                      value={editor.description}
                      onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                      placeholder="e.g. Brand campaign — Autumn 2026"
                      maxLength={200}
                    />
                  </div>
                  <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
                  <div
                    className="tvp-form-group"
                    data-tour="editor-client"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <label htmlFor="editor-client-picker">Client</label>
                    <ClientPicker
                      id="editor-client-picker"
                      clients={savedClients}
                      value={editor.client_id}
                      fallbackLabel={editor.client_name || null}
                      disabled={financialsLocked}
                      onSelect={(c) => setEditor(applyClient(editor, c))}
                      onAddNew={() => setAddingClient(true)}
                    />
                    {editor.client_id || editor.client_name ? (
                      <div className="tvp-client-summary" data-tour="editor-recipients">
                        {editor.recipient_contact_person && (
                          <div>Attention: {editor.recipient_contact_person}</div>
                        )}
                        <div>{editor.recipient_address || "No billing address saved"}</div>
                        {editor.recipient_vat_number && (
                          <div>VAT number: {editor.recipient_vat_number}</div>
                        )}
                        <div className="tvp-muted">
                          Sends to: {editor.recipient_emails.join(", ") || "no email address saved"}
                        </div>
                        {!financialsLocked && editor.client_id && (
                          <div className="tvp-field-hint">
                            Change these details on the{" "}
                            <Link
                              to="/agency/clients/$clientId"
                              params={{ clientId: editor.client_id }}
                              className="tvp-link"
                            >
                              client's page
                            </Link>
                            . Drafts always use the latest details; once sent, this document keeps
                            a copy that never changes.
                          </div>
                        )}
                        {!editor.client_id && !financialsLocked && (
                          <div className="tvp-field-hint tvp-field-warn">
                            Choose a saved client before sending.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="tvp-field-hint">
                        A client is required before you can send. Their details fill in
                        automatically.
                      </div>
                    )}
                  </div>
                  <div className="tvp-form-group">
                    <label htmlFor="editor-talent">Talent</label>
                    <Select
                      value={editor.talent_name.trim() ? editor.talent_name : NO_TALENT}
                      onValueChange={(v: string) =>
                        setEditor({ ...editor, talent_name: v === NO_TALENT ? "" : v })
                      }
                    >
                      <SelectTrigger id="editor-talent">
                        <SelectValue placeholder="No talent (client-only)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_TALENT}>No talent (client-only)</SelectItem>
                        {roster.map((t: any) => (
                          <SelectItem key={t.id} value={t.displayName}>
                            {t.displayName}
                          </SelectItem>
                        ))}
                        {editor.talent_name.trim() &&
                          !rosterNames.has(editor.talent_name.trim().toLowerCase()) && (
                            <SelectItem value={editor.talent_name}>
                              {editor.talent_name} (no longer on your roster)
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                    <div className="tvp-muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {!editor.talent_name.trim()
                        ? "Choose a roster member, or leave as client-only with no talent attached."
                        : rosterNames.has(editor.talent_name.trim().toLowerCase())
                          ? "Matched to your roster — sharing will reach this talent."
                          : "No longer on your roster — sharing won't reach this talent."}
                    </div>
                  </div>
                  <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
                    <label>Issued</label>
                    <input
                      type="date"
                      disabled={financialsLocked}
                      value={editor.issued_at}
                      onChange={(e) => setEditor({ ...editor, issued_at: e.target.value })}
                    />
                  </div>
                  <div className="tvp-form-group">
                    <label>{editor.kind === "quote" ? "Valid until" : "Due"}</label>
                    <input
                      type="date"
                      disabled={financialsLocked}
                      value={editor.due_date}
                      onChange={(e) => setEditor({ ...editor, due_date: e.target.value })}
                    />
                  </div>
                  <div className="tvp-form-group">
                    <label>Currency</label>
                    <input
                      value={editor.currency}
                      maxLength={3}
                      disabled={financialsLocked}
                      onChange={(e) =>
                        setEditor({ ...editor, currency: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                  {editor.kind === "quote" ? (
                    <div className="tvp-form-group">
                      <label>Acceptance window (days)</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={editor.acceptance_window_days}
                        onChange={(e) =>
                          setEditor({ ...editor, acceptance_window_days: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <div className="tvp-form-group">
                      <label>Payment terms (days)</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={editor.payment_terms_days}
                        onChange={(e) =>
                          setEditor({ ...editor, payment_terms_days: e.target.value })
                        }
                      />
                    </div>
                  )}
                  <div className="tvp-form-group">
                    <label>Status</label>
                    <select
                      value={editor.status}
                      onChange={(e) =>
                        setEditor({ ...editor, status: e.target.value as Row["status"] })
                      }
                    >
                      {(Object.keys(STATUS_LABEL) as Row["status"][]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Line items */}
                <div style={{ marginTop: 20 }}>
                  <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                    <h3 className="tvp-h3" style={{ margin: 0 }}>
                      Line items
                    </h3>
                    <button
                      className="tvp-secondary"
                      type="button"
                      data-tour="editor-add-line"
                      disabled={financialsLocked}
                      onClick={addLine}
                    >
                      <Plus className="h-4 w-4" />
                      Add line
                    </button>
                  </div>
                  <div className="tvp-lines">
                    <div className="tvp-line-row tvp-line-head" aria-hidden="true">
                      <div>Description</div>
                      <div className="tvp-num">Quantity</div>
                      <div className="tvp-num">Unit price (excl. VAT)</div>
                      <div className="tvp-num">VAT %</div>
                      <div className="tvp-num">Line total</div>
                      <div />
                    </div>
                    {editor.lines.map((l, i) => {
                      const line = Math.round(
                        (Number(l.quantity) || 0) * (Number(l.unit_price_cents) || 0),
                      );
                      return (
                        <div key={i} className="tvp-line-row">
                          <input
                            aria-label="Description"
                            value={l.description}
                            disabled={financialsLocked}
                            onChange={(e) => updateLine(i, { description: e.target.value })}
                            placeholder="e.g. Full-day shoot"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={financialsLocked}
                            value={l.quantity}
                            onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                            aria-label="Quantity"
                            placeholder="Quantity"
                            className="tvp-num"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={financialsLocked}
                            value={(l.unit_price_cents / 100).toString()}
                            onChange={(e) =>
                              updateLine(i, {
                                unit_price_cents: Math.round(Number(e.target.value) * 100),
                              })
                            }
                            aria-label="Unit price (excl. VAT)"
                            placeholder="Unit price"
                            className="tvp-num"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            disabled={financialsLocked}
                            value={(l.vat_rate_bp / 100).toString()}
                            onChange={(e) =>
                              updateLine(i, {
                                vat_rate_bp: Math.round(Number(e.target.value) * 100),
                              })
                            }
                            aria-label="VAT %"
                            placeholder="VAT %"
                            className="tvp-num"
                          />
                          <div className="tvp-num tvp-line-total">
                            {fmtMoney(line, editor.currency)}
                          </div>
                          <button
                            className="tvp-mini-btn"
                            type="button"
                            onClick={() => removeLine(i)}
                            disabled={financialsLocked || editor.lines.length === 1}
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    <div data-tour="editor-totals" className="tvp-totals">
                      <p className="tvp-muted tvp-totals-note">
                        Worked out from the lines above. The subtotal excludes VAT; VAT is added per
                        line.
                      </p>
                      <dl className="tvp-totals-list">
                        <div>
                          <dt>Subtotal (excl. VAT)</dt>
                          <dd className="tvp-num">{fmtMoney(editorTotals.subtotal_cents, editor.currency)}</dd>
                        </div>
                        <div>
                          <dt>VAT</dt>
                          <dd className="tvp-num">{fmtMoney(editorTotals.vat_cents, editor.currency)}</dd>
                        </div>
                        <div className="tvp-totals-grand">
                          <dt>Total</dt>
                          <dd className="tvp-num">{fmtMoney(editorTotals.total_cents, editor.currency)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>

                <div className="tvp-form-group" style={{ marginTop: 12 }}>
                  <label>Notes and terms</label>
                  <textarea
                    value={editor.notes}
                    onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                    rows={3}
                    placeholder="Additional terms or notes shown on the document"
                  />
                </div>

                {editor.kind === "invoice" && (
                  <div className="tvp-form-group" style={{ marginTop: 12 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={editor.allow_partial_payment}
                        onChange={(e) =>
                          setEditor({ ...editor, allow_partial_payment: e.target.checked })
                        }
                      />
                      Allow partial payment
                    </label>
                  </div>
                )}
                <div className="tvp-form-group" style={{ marginTop: 12 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={editor.shared_with_talent}
                      onChange={(e) =>
                        setEditor({ ...editor, shared_with_talent: e.target.checked })
                      }
                    />
                    Share with linked talent
                  </label>
                </div>

                <div className="tvp-form-footer" data-tour="editor-actions">
                  <div>
                    <button
                      className="tvp-secondary"
                      type="button"
                      disabled={!previewAgency || save.isPending}
                      onClick={() => setPreviewOpen(true)}
                      title={
                        !previewAgency ? "Loading agency settings…" : "Preview as it will be sent"
                      }
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button className="tvp-secondary" onClick={() => setEditorOpen(false)}>
                      Cancel
                    </button>
                    <button
                      className="tvp-primary"
                      onClick={() => save.mutate()}
                      disabled={save.isPending}
                    >
                      <Save className="h-4 w-4" />
                      {save.isPending ? "Saving…" : "Save draft"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {previewOpen && previewAgency && (
        <BillingPreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          doc={{
            kind: editor.kind,
            number: editor.number || `DRAFT-${(editor.id ?? "NEW").slice(0, 6).toUpperCase()}`,
            client_name: editor.client_name || null,
            recipient_contact_person: editor.recipient_contact_person || null,
            recipient_address: editor.recipient_address || null,
            recipient_vat_number: editor.recipient_vat_number || null,
            recipient_email: editor.recipient_emails[0] ?? null,
            talent_name: editor.talent_name || null,
            description: editor.description || null,
            issued_at: editor.issued_at,
            due_date: editor.due_date || null,
            currency: editor.currency.toUpperCase(),
            notes: editor.notes || null,
            status: editor.status,
            acceptance_window_days: editor.acceptance_window_days
              ? Number(editor.acceptance_window_days)
              : null,
            payment_terms_days: editor.payment_terms_days
              ? Number(editor.payment_terms_days)
              : null,
          }}
          lines={editor.lines.filter((l) => l.description.trim())}
          agency={previewAgency}
          sendFrom={sendFromLabel}
          recipients={editor.recipient_emails}
          canSend={
            !!editor.id &&
            editor.recipient_emails.length > 0 &&
            !!settings?.billing_from_verified_at &&
            !!settings?.billing_from_email &&
            (editor.status === "draft" || (editor.number || "").startsWith("DRAFT-"))
          }
          sendDisabledReason={
            !editor.id
              ? "Save this draft first before sending."
              : editor.recipient_emails.length === 0
                ? "Add at least one recipient email address before sending."
                : !settings?.billing_from_verified_at || !settings?.billing_from_email
                  ? "Verify a sending address in Quotes & Invoices Settings before sending."
                  : "This record has already been sent."
          }
          canMarkSent={
            !!editor.id && (editor.status === "draft" || (editor.number || "").startsWith("DRAFT-"))
          }
          markSentDisabledReason={
            !editor.id ? "Save this draft first." : "This record has already been sent."
          }
          onSend={() => send.mutate()}
          sending={send.isPending}
          onMarkSent={() => markPreviewSent.mutate()}
          markingSent={markPreviewSent.isPending}
        />
      )}
    </>
  );
}
