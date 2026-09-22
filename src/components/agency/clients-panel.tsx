import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Info, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  listAgencyClients,
  saveAgencyClient,
  removeAgencyClient,
  listAgencyStaff,
  listAgencyDismissedNotices,
  dismissAgencyReminder,
} from "@/lib/agency.functions";
import { ModalShell } from "@/components/shared/modal-shell";
import { usePagedList } from "@/lib/pagination";
import { LoadMoreBar } from "@/components/shared/load-more";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { EmailChipsInput } from "@/components/shared/email-chips-input";
import { SectionHeader } from "@/components/account/section-header";
import { EntityCard } from "@/components/shared/entity-card";
import { ClientDetailPanel, money } from "@/components/agency/client-detail-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAYMENT_NOTE_KIND = "client_payment_tracking";

const CLIENT_TYPES = [
  "Brand",
  "Advertising agency",
  "Production company",
  "Broadcaster",
  "Publisher",
  "Event organiser",
  "Individual",
  "Other",
];

export type ClientStats = {
  docCount: number;
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
};

export type AgencyClient = {
  id: string;
  name: string;
  trading_name: string | null;
  client_type: string | null;
  contact_person: string | null;
  contact_title: string | null;
  emails: string[] | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
  company_registration_number: string | null;
  payment_terms_days: number | null;
  relationship_manager_user_id: string | null;
  relationship_manager_name?: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  stats?: ClientStats;
};

type FormState = {
  id?: string;
  name: string;
  trading_name: string;
  client_type: string;
  contact_person: string;
  contact_title: string;
  emails: string[];
  phone: string;
  address: string;
  vat_number: string;
  company_registration_number: string;
  payment_terms_days: string;
  relationship_manager_user_id: string;
  city: string;
  country: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    trading_name: "",
    client_type: "",
    contact_person: "",
    contact_title: "",
    emails: [],
    phone: "",
    address: "",
    vat_number: "",
    company_registration_number: "",
    payment_terms_days: "",
    relationship_manager_user_id: "",
    city: "",
    country: "",
    notes: "",
  };
}

function toForm(c: AgencyClient): FormState {
  return {
    id: c.id,
    name: c.name ?? "",
    trading_name: c.trading_name ?? "",
    client_type: c.client_type ?? "",
    contact_person: c.contact_person ?? "",
    contact_title: c.contact_title ?? "",
    emails: c.emails ?? [],
    phone: c.phone ?? "",
    address: c.address ?? "",
    vat_number: c.vat_number ?? "",
    company_registration_number: c.company_registration_number ?? "",
    payment_terms_days: c.payment_terms_days != null ? String(c.payment_terms_days) : "",
    relationship_manager_user_id: c.relationship_manager_user_id ?? "",
    city: c.city ?? "",
    country: c.country ?? "",
    notes: c.notes ?? "",
  };
}

export function useAgencyClients() {
  const listFn = useServerFn(listAgencyClients);
  return useQuery({
    queryKey: ["agency", "clients"],
    queryFn: () => listFn() as Promise<{ clients: AgencyClient[] }>,
  });
}

export function ClientsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAgencyClients();
  const saveFn = useServerFn(saveAgencyClient);
  const removeFn = useServerFn(removeAgencyClient);
  const staffFn = useServerFn(listAgencyStaff);
  const dismissedFn = useServerFn(listAgencyDismissedNotices);
  const dismissFn = useServerFn(dismissAgencyReminder);

  const staff = useQuery({ queryKey: ["agency", "staff"], queryFn: () => staffFn() as Promise<any[]> });
  const dismissals = useQuery({
    queryKey: ["agency", "dismissed-notices"],
    queryFn: () => dismissedFn() as Promise<{ kinds: string[] }>,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AgencyClient | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.trading_name ?? "").toLowerCase().includes(q) ||
        (c.contact_person ?? "").toLowerCase().includes(q) ||
        (c.vat_number ?? "").toLowerCase().includes(q) ||
        (c.emails ?? []).some((e) => e.toLowerCase().includes(q)),
    );
  }, [clients, search]);

  // Rule of 10: the grid caps at a batch, with "Load more" below it.
  const page = usePagedList(filtered, { resetKey: search });

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return null;
      if (!form.name.trim()) throw new Error("Enter the client or company name");
      const terms = form.payment_terms_days.trim();
      return saveFn({
        data: {
          id: form.id,
          name: form.name.trim(),
          trading_name: form.trading_name.trim() || null,
          client_type: form.client_type || null,
          contact_person: form.contact_person.trim() || null,
          contact_title: form.contact_title.trim() || null,
          emails: form.emails,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          vat_number: form.vat_number.trim() || null,
          company_registration_number: form.company_registration_number.trim() || null,
          payment_terms_days: terms ? Number(terms) : null,
          relationship_manager_user_id: form.relationship_manager_user_id || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "clients"] });
      qc.invalidateQueries({ queryKey: ["agency", "client-detail"] });
      toast.success(form?.id ? "Client updated" : "Client saved");
      setForm(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save this client"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "clients"] });
      toast.success("Client removed");
      setConfirmRemove(null);
      setDetailId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove this client"),
  });

  const dismissNote = useMutation({
    mutationFn: async () => dismissFn({ data: { kind: PAYMENT_NOTE_KIND, snapshot: 1 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agency", "dismissed-notices"] }),
  });

  const noteDismissed = (dismissals.data?.kinds ?? []).includes(PAYMENT_NOTE_KIND);

  return (
    <div className="tvp-card">
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <SectionHeader
          icon={<Users className="h-4 w-4" />}
          tone="teal"
          title="Clients"
          subtitle="Save the people you bill so you don't retype their details on every quote or invoice."
        />
        <button type="button" className="tvp-primary" onClick={() => setForm(emptyForm())}>
          <Plus className="h-4 w-4" /> New client
        </button>
      </div>

      {clients.length > 0 && (
        <div style={{ marginTop: 14, maxWidth: 360 }}>
          <Label htmlFor="client-search" className="tvp-entity-stat-label">Search</Label>
          <Input
            id="client-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by company, contact or VAT..."
            aria-label="Search clients"
          />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {isLoading ? (
          <div className="tvp-muted">Loading your clients…</div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <h3 className="tvp-h3">Your clients could not be loaded</h3>
            <p className="tvp-muted" style={{ marginTop: 6 }}>
              {(error as Error)?.message ?? "Something went wrong."}
            </p>
            <button type="button" className="tvp-secondary" style={{ marginTop: 12 }} onClick={() => refetch()}>
              Try again
            </button>
          </div>
        ) : clients.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 16px" }}>
            <Building2 className="h-5 w-5" style={{ margin: "0 auto 10px", opacity: 0.6 }} />
            <h3 className="tvp-h3">No clients saved yet</h3>
            <p className="tvp-muted" style={{ marginTop: 6, maxWidth: 440, marginInline: "auto" }}>
              Add the companies and people you invoice — name, contact person and one or more email
              addresses. They'll then be a click away whenever you create a quote or invoice.
            </p>
            <button
              type="button"
              className="tvp-primary"
              style={{ marginTop: 14 }}
              onClick={() => setForm(emptyForm())}
            >
              <Plus className="h-4 w-4" /> Add your first client
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <h3 className="tvp-h3">No clients match your search</h3>
            <p className="tvp-muted" style={{ marginTop: 6 }}>Try a different name, contact or VAT number.</p>
          </div>
        ) : (
          <>
            <div className="tvp-entity-grid">
              {page.visible.map((c) => {
                const s = c.stats;
                const outstandingLabel = (s?.overdueCents ?? 0) > 0 ? "Overdue" : "Outstanding";
                const outstandingValue =
                  (s?.overdueCents ?? 0) > 0 ? (s?.overdueCents ?? 0) : (s?.outstandingCents ?? 0);
                return (
                  <EntityCard
                    key={c.id}
                    name={c.name}
                    subtitle={[c.client_type, c.payment_terms_days != null ? `${c.payment_terms_days}-day terms` : null]
                      .filter(Boolean)
                      .join(" · ") || "Client type not set"}
                    meta={
                      c.contact_person
                        ? `${c.contact_person}${c.contact_title ? ` · ${c.contact_title}` : ""}`
                        : "No contact person saved"
                    }
                    ariaLabel={`Open ${c.name}`}
                    onClick={() => setDetailId(c.id)}
                    stats={[
                      { label: "Documents", value: s?.docCount ?? 0 },
                      { label: "Invoiced", value: money(s?.invoicedCents ?? 0) },
                      {
                        label: outstandingLabel,
                        value: money(outstandingValue),
                        tone: (s?.overdueCents ?? 0) > 0 ? "red" : undefined,
                      },
                    ]}
                    actions={
                      <RowActionsMenu
                        label={`Actions for ${c.name}`}
                        actions={[
                          {
                            key: "edit",
                            label: "Edit client",
                            icon: Pencil,
                            onSelect: () => setForm(toForm(c)),
                          },
                          {
                            key: "remove",
                            label: "Remove client",
                            icon: Trash2,
                            destructive: true,
                            separatorBefore: true,
                            onSelect: () => setConfirmRemove(c),
                          },
                        ]}
                      />
                    }
                  />
                );
              })}
            </div>

            <LoadMoreBar
              noun="clients"
              shown={page.shown}
              total={page.total}
              hasMore={page.hasMore}
              onLoadMore={page.loadMore}
            />

            {!noteDismissed && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--tv-surface-2, var(--muted))",
                  color: "var(--muted-foreground)",
                  fontSize: 13,
                }}
              >
                <Info className="h-4 w-4" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  Payments are tracked manually — record each payment against its invoice and these
                  figures stay accurate.
                </div>
                <button
                  type="button"
                  className="tvp-mini-btn"
                  aria-label="Dismiss payment tracking note"
                  onClick={() => dismissNote.mutate()}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="tvp-muted" style={{ marginTop: 10, fontSize: 12 }}>
              Showing {filtered.length} of {clients.length} client{clients.length === 1 ? "" : "s"}
            </div>
          </>
        )}
      </div>

      {detailId && (
        <ClientDetailPanel
          clientId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            const c = clients.find((x) => x.id === id);
            if (c) {
              setDetailId(null);
              setForm(toForm(c));
            }
          }}
        />
      )}

      {form && (
        <ModalShell onClose={() => setForm(null)} maxWidth={620} labelledBy="client-form-title">
          <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
            <h2 className="tvp-h2" id="client-form-title">
              {form.id ? "Edit client" : "New client"}
            </h2>
            <button type="button" title="Close" className="tvp-mini-btn" onClick={() => setForm(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="tvp-rule-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="client-name">Client / company name</Label>
              <Input
                id="client-name"
                value={form.name}
                maxLength={200}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Brightline Media (Pty) Ltd"
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-trading">Trading name</Label>
              <Input
                id="client-trading"
                value={form.trading_name}
                maxLength={200}
                onChange={(e) => setForm({ ...form, trading_name: e.target.value })}
                placeholder="If different to the registered name"
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-type">Client type</Label>
              <Select
                value={form.client_type}
                onValueChange={(v) => setForm({ ...form, client_type: v })}
              >
                <SelectTrigger id="client-type" className="tvp-modal-control">
                  <SelectValue placeholder="Select a type…" />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-contact">Contact person</Label>
              <Input
                id="client-contact"
                value={form.contact_person}
                maxLength={200}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                placeholder="e.g. Nomsa Dlamini"
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-contact-title">Contact role</Label>
              <Input
                id="client-contact-title"
                value={form.contact_title}
                maxLength={120}
                onChange={(e) => setForm({ ...form, contact_title: e.target.value })}
                placeholder="e.g. Accounts payable"
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                maxLength={40}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+27 82 000 0000"
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-terms">Payment terms (days)</Label>
              <Input
                id="client-terms"
                type="number"
                min={0}
                max={365}
                value={form.payment_terms_days}
                onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
                placeholder="e.g. 30"
              />
            </div>
            <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="client-emails">Email addresses</Label>
              <EmailChipsInput
                inputId="client-emails"
                value={form.emails}
                onChange={(next) => setForm({ ...form, emails: next })}
                placeholder="e.g. accounts@brightline.co.za"
              />
            </div>
            <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="client-address">Billing address</Label>
              <Textarea
                id="client-address"
                rows={2}
                value={form.address}
                maxLength={500}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-city">City</Label>
              <Input
                id="client-city"
                value={form.city}
                maxLength={120}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-country">Country</Label>
              <Input
                id="client-country"
                value={form.country}
                maxLength={120}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-vat">VAT number</Label>
              <Input
                id="client-vat"
                value={form.vat_number}
                maxLength={64}
                onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
              />
            </div>
            <div className="tvp-form-group">
              <Label htmlFor="client-reg">Company registration number</Label>
              <Input
                id="client-reg"
                value={form.company_registration_number}
                maxLength={80}
                onChange={(e) =>
                  setForm({ ...form, company_registration_number: e.target.value })
                }
              />
            </div>
            <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="client-manager">Relationship manager</Label>
              <Select
                value={form.relationship_manager_user_id || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, relationship_manager_user_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger id="client-manager" className="tvp-modal-control">
                  <SelectValue placeholder="Select a team member…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {(staff.data ?? []).map((m: any) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                rows={2}
                value={form.notes}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything useful for billing — purchase order rules, preferred terms…"
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" className="tvp-secondary" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="tvp-primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.name.trim()}
            >
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Save client"}
            </button>
          </div>
        </ModalShell>
      )}

      {confirmRemove && (
        <ModalShell onClose={() => setConfirmRemove(null)} maxWidth={460} labelledBy="client-remove-title">
          <h2 className="tvp-h2" id="client-remove-title">
            Remove {confirmRemove.name}?
          </h2>
          <p className="tvp-muted" style={{ marginTop: 8 }}>
            They'll no longer appear when you create a quote or invoice. Quotes and invoices already
            issued to them are untouched and keep the details exactly as they were sent.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" className="tvp-secondary" onClick={() => setConfirmRemove(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="tvp-danger"
              onClick={() => remove.mutate(confirmRemove.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Removing…" : "Remove client"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
