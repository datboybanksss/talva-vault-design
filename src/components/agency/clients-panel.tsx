import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Building2, Eye, Pencil, Plus, X } from "lucide-react";
import {
  listAgencyClients,
  saveAgencyClient,
  removeAgencyClient,
  restoreAgencyClient,
  checkAgencyClientDuplicates,
  listAgencyStaff,
} from "@/lib/agency.functions";
import { ModalShell } from "@/components/shared/modal-shell";
import { usePagedList } from "@/lib/pagination";
import { LoadMoreBar } from "@/components/shared/load-more";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { EmailChipsInput } from "@/components/shared/email-chips-input";
import { FilterBar } from "@/components/shared/filter-bar";
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
import { friendlyError } from "@/lib/friendly-error";
import { matchesSearch } from "@/lib/search";
import { duplicateMessage, type ClientDuplicates } from "@/lib/client-duplicates";

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

export const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

export const DEFAULT_COUNTRY = "South Africa";

export type ClientStats = {
  docCount: number;
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
  lastUsedAt: string | null;
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
  address_suburb: string | null;
  province: string | null;
  postal_code: string | null;
  vat_number: string | null;
  company_registration_number: string | null;
  payment_terms_days: number | null;
  relationship_manager_user_id: string | null;
  relationship_manager_name?: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at?: string;
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
  address_suburb: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  vat_number: string;
  company_registration_number: string;
  payment_terms_days: string;
  relationship_manager_user_id: string;
  notes: string;
};

export function emptyClientForm(): FormState {
  return {
    name: "",
    trading_name: "",
    client_type: "",
    contact_person: "",
    contact_title: "",
    emails: [],
    phone: "",
    address: "",
    address_suburb: "",
    city: "",
    province: "",
    postal_code: "",
    country: DEFAULT_COUNTRY,
    vat_number: "",
    company_registration_number: "",
    payment_terms_days: "",
    relationship_manager_user_id: "",
    notes: "",
  };
}

export function clientToForm(c: AgencyClient): FormState {
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
    address_suburb: c.address_suburb ?? "",
    city: c.city ?? "",
    province: c.province ?? "",
    postal_code: c.postal_code ?? "",
    country: c.country ?? DEFAULT_COUNTRY,
    vat_number: c.vat_number ?? "",
    company_registration_number: c.company_registration_number ?? "",
    payment_terms_days: c.payment_terms_days != null ? String(c.payment_terms_days) : "",
    relationship_manager_user_id: c.relationship_manager_user_id ?? "",
    notes: c.notes ?? "",
  };
}

export function useAgencyClients(includeArchived = false) {
  const listFn = useServerFn(listAgencyClients);
  return useQuery({
    queryKey: ["agency", "clients", includeArchived ? "all" : "active"],
    queryFn: () =>
      listFn({ data: { includeArchived } }) as Promise<{ clients: AgencyClient[] }>,
  });
}

export function fmtShortDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All clients" },
];

/** The Clients page: agency-scoped client book. */
export function ClientsPanel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useAgencyClients(true);
  const removeFn = useServerFn(removeAgencyClient);
  const restoreFn = useServerFn(restoreAgencyClient);

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<AgencyClient | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");

  const all = useMemo(() => data?.clients ?? [], [data]);
  const filtered = useMemo(
    () =>
      all.filter((c) => {
        if (status === "active" && c.archived_at) return false;
        if (status === "archived" && !c.archived_at) return false;
        return matchesSearch(search, [
          c.name,
          c.trading_name,
          c.contact_person,
          c.vat_number,
          ...(c.emails ?? []),
        ]);
      }),
    [all, search, status],
  );
  const counts = useMemo(() => {
    const searched = all.filter((c) =>
      matchesSearch(search, [c.name, c.trading_name, c.contact_person, c.vat_number, ...(c.emails ?? [])]),
    );
    return {
      active: searched.filter((c) => !c.archived_at).length,
      archived: searched.filter((c) => c.archived_at).length,
      all: searched.length,
    };
  }, [all, search]);

  const page = usePagedList(filtered, { resetKey: `${search}|${status}` });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["agency", "clients"] });
    qc.invalidateQueries({ queryKey: ["agency", "client-detail"] });
  };

  const archive = useMutation({
    mutationFn: async (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Client archived");
      setConfirmArchive(null);
    },
    onError: (e: any) => toast.error(friendlyError(e, "Could not archive this client")),
  });
  const restore = useMutation({
    mutationFn: async (id: string) => restoreFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Client restored");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Could not restore this client")),
  });

  const openDetail = (id: string) =>
    navigate({ to: "/agency/clients/$clientId", params: { clientId: id } });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Clients</h1>
          <div className="tvp-subtitle">
            Everyone you send quotes and invoices to. Save their details once and pick them from
            the list on any quote or invoice.
          </div>
        </div>
        <div className="tvp-actions">
          <button
            type="button"
            className="tvp-primary"
            data-tour="clients-new"
            onClick={() => setForm(emptyClientForm())}
          >
            <Plus className="h-4 w-4" /> New client
          </button>
        </div>
      </div>

      <div className="tvp-card tvp-panel-pad">
        <FilterBar
          tourId="clients-filters"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: "Search by name, contact, email or VAT",
          }}
          active={search !== "" || status !== "active"}
          onClear={() => {
            setSearch("");
            setStatus("active");
          }}
          onChange={(_k, v) => setStatus(v)}
          filters={[
            {
              key: "status",
              label: "Status",
              value: status,
              options: STATUS_OPTIONS.map((o) => ({
                ...o,
                count: counts[o.value as keyof typeof counts],
              })),
            },
          ]}
        />

        <div style={{ marginTop: "var(--sp-16, 16px)" }}>
          {isLoading ? (
            <div className="tvp-muted">Loading your clients…</div>
          ) : isError ? (
            <div className="tvp-empty">
              <h3 className="tvp-h3">Your clients could not be loaded</h3>
              <p className="tvp-muted">{friendlyError(error, "Something went wrong.")}</p>
              <button type="button" className="tvp-secondary" onClick={() => refetch()}>
                Try again
              </button>
            </div>
          ) : all.length === 0 ? (
            <div className="tvp-empty">
              <Building2 className="h-5 w-5" aria-hidden />
              <h3 className="tvp-h3">No clients saved yet</h3>
              <p className="tvp-muted">
                Add the companies and people you bill. They'll then be a click away whenever you
                create a quote or invoice.
              </p>
              <button
                type="button"
                className="tvp-primary"
                onClick={() => setForm(emptyClientForm())}
              >
                <Plus className="h-4 w-4" /> Add your first client
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="tvp-empty">
              <h3 className="tvp-h3">
                {search ? `No results for '${search.trim()}'` : "No clients in this view"}
              </h3>
              {search && (
                <button type="button" className="tvp-link" onClick={() => setSearch("")}>
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="tvp-table-wrap">
                <table className="tvp-table" data-tour="clients-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Contact person</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th className="tvp-num">Quotes and invoices</th>
                      <th className="tvp-nowrap">Last used</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {page.visible.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <button
                            type="button"
                            className="tvp-link"
                            onClick={() => openDetail(c.id)}
                          >
                            {c.name}
                          </button>
                          {c.archived_at && (
                            <span className="tvp-status tvp-neutral" style={{ marginLeft: 8 }}>
                              Archived
                            </span>
                          )}
                          {c.trading_name && (
                            <div className="tvp-muted">Trading as {c.trading_name}</div>
                          )}
                        </td>
                        <td>{c.contact_person || "—"}</td>
                        <td>{c.emails?.[0] || "—"}</td>
                        <td className="tvp-nowrap">{c.phone || "—"}</td>
                        <td className="tvp-num">{c.stats?.docCount ?? 0}</td>
                        <td className="tvp-nowrap">
                          {fmtShortDate(c.stats?.lastUsedAt) ?? "Not used yet"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <RowActionsMenu
                            label={`Actions for ${c.name}`}
                            actions={[
                              {
                                key: "view",
                                label: "View",
                                icon: Eye,
                                onSelect: () => openDetail(c.id),
                              },
                              {
                                key: "edit",
                                label: "Edit",
                                icon: Pencil,
                                onSelect: () => setForm(clientToForm(c)),
                              },
                              c.archived_at
                                ? {
                                    key: "restore",
                                    label: "Restore",
                                    icon: ArchiveRestore,
                                    separatorBefore: true,
                                    onSelect: () => restore.mutate(c.id),
                                  }
                                : {
                                    key: "archive",
                                    label: "Archive",
                                    icon: Archive,
                                    destructive: true,
                                    separatorBefore: true,
                                    onSelect: () => setConfirmArchive(c),
                                  },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <LoadMoreBar
                noun="clients"
                shown={page.shown}
                total={page.total}
                hasMore={page.hasMore}
                onLoadMore={page.loadMore}
              />
            </>
          )}
        </div>
      </div>

      {form && (
        <ClientFormModal
          initial={form}
          onClose={() => setForm(null)}
          onSaved={() => setForm(null)}
        />
      )}

      {confirmArchive && (
        <ModalShell
          onClose={() => setConfirmArchive(null)}
          maxWidth={460}
          labelledBy="client-archive-title"
        >
          <h2 className="tvp-h2" id="client-archive-title">
            Archive {confirmArchive.name}?
          </h2>
          <p className="tvp-muted" style={{ marginTop: 8 }}>
            They'll no longer appear in the client list on new quotes and invoices. Documents
            already issued to them keep the details exactly as they were sent. You can restore them
            at any time.
          </p>
          <div className="tvp-form-footer">
            <button type="button" className="tvp-secondary" onClick={() => setConfirmArchive(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="tvp-danger"
              onClick={() => archive.mutate(confirmArchive.id)}
              disabled={archive.isPending}
            >
              {archive.isPending ? "Archiving…" : "Archive client"}
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

/**
 * Add or edit a client. `compact` shows only what a quote or invoice needs
 * (used from the quote/invoice editor's "Add new client").
 */
export function ClientFormModal({
  initial,
  onClose,
  onSaved,
  compact = false,
}: {
  initial: FormState;
  onClose: () => void;
  onSaved: (id: string, client: AgencyClient) => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveAgencyClient);
  const dupFn = useServerFn(checkAgencyClientDuplicates);
  const staffFn = useServerFn(listAgencyStaff);
  const staff = useQuery({
    queryKey: ["agency", "staff"],
    queryFn: () => staffFn() as Promise<any[]>,
    enabled: !compact,
  });
  const [form, setForm] = useState<FormState>(initial);
  const [dups, setDups] = useState<ClientDuplicates | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Warn-only duplicate check, debounced while typing.
  const dupKey = `${form.name}|${form.emails.join(",")}|${form.vat_number}`;
  useEffect(() => {
    const t = setTimeout(() => {
      if (!form.name.trim() && form.emails.length === 0 && !form.vat_number.trim()) {
        setDups(null);
        return;
      }
      dupFn({
        data: {
          id: form.id ?? null,
          name: form.name,
          emails: form.emails,
          vat_number: form.vat_number,
        },
      })
        .then((r) => setDups(r as ClientDuplicates))
        .catch(() => setDups(null));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey]);

  const save = useMutation({
    mutationFn: async () => {
      const terms = form.payment_terms_days.trim();
      const payload = {
        id: form.id,
        name: form.name.trim(),
        trading_name: form.trading_name.trim() || null,
        client_type: form.client_type || null,
        contact_person: form.contact_person.trim() || null,
        contact_title: form.contact_title.trim() || null,
        emails: form.emails,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        address_suburb: form.address_suburb.trim() || null,
        city: form.city.trim() || null,
        province: form.province || null,
        postal_code: form.postal_code.trim() || null,
        country: form.country.trim() || DEFAULT_COUNTRY,
        vat_number: form.vat_number.trim() || null,
        company_registration_number: form.company_registration_number.trim() || null,
        payment_terms_days: terms ? Number(terms) : null,
        relationship_manager_user_id: form.relationship_manager_user_id || null,
        notes: form.notes.trim() || null,
      };
      const r = (await saveFn({ data: payload })) as { id: string };
      return { id: r.id, payload };
    },
    onSuccess: ({ id, payload }) => {
      qc.invalidateQueries({ queryKey: ["agency", "clients"] });
      qc.invalidateQueries({ queryKey: ["agency", "client-detail"] });
      toast.success(form.id ? "Client updated" : "Client saved");
      onSaved(id, { ...(payload as any), id, archived_at: null });
    },
    onError: (e: any) => toast.error(friendlyError(e, "Could not save this client")),
  });

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const canSave = form.name.trim() !== "" && form.emails.length > 0 && !save.isPending;

  const dupNote = (field: keyof ClientDuplicates) =>
    dups?.[field] ? (
      <div className="tvp-field-hint tvp-field-warn" role="status">
        {duplicateMessage(field, dups[field]!)}
      </div>
    ) : null;

  const text = (
    key: keyof FormState,
    label: string,
    opts: { max?: number; placeholder?: string; full?: boolean; type?: string } = {},
  ) => (
    <div className="tvp-form-group" style={opts.full ? { gridColumn: "1 / -1" } : undefined}>
      <Label htmlFor={`client-${key}`}>{label}</Label>
      <Input
        id={`client-${key}`}
        type={opts.type}
        value={form[key] as string}
        maxLength={opts.max}
        placeholder={opts.placeholder}
        onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)}
      />
      {(key === "name" || key === "vat_number") && dupNote(key)}
    </div>
  );

  return (
    <ModalShell onClose={onClose} maxWidth={660} labelledBy="client-form-title">
      <div className="tvp-modal-head">
        <h2 className="tvp-h2" id="client-form-title">
          {form.id ? "Edit client" : compact ? "Add new client" : "New client"}
        </h2>
        <button type="button" title="Close" className="tvp-mini-btn" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="tvp-modal-body">
        <div className="tvp-form-grid-2">
          {text("name", "Client or company name", {
            max: 200,
            full: true,
            placeholder: "e.g. Brightline Media (Pty) Ltd",
          })}
          <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
            <Label htmlFor="client-emails">Email</Label>
            <EmailChipsInput
              inputId="client-emails"
              value={form.emails}
              onChange={(next) => {
                setEmailError(null);
                set({ emails: next });
              }}
              placeholder="e.g. accounts@brightline.co.za"
            />
            {emailError && <div className="tvp-field-hint tvp-field-error">{emailError}</div>}
            {form.emails.length === 0 && (
              <div className="tvp-field-hint">At least one email address is required.</div>
            )}
            {dupNote("email")}
          </div>
          {text("contact_person", "Contact person", { max: 200, placeholder: "e.g. Nomsa Dlamini" })}
          {text("phone", "Phone", { max: 40, placeholder: "+27 82 000 0000" })}
          {text("vat_number", "VAT number", { max: 64, placeholder: "e.g. 4123456789" })}
          {text("company_registration_number", "Company registration number", {
            max: 80,
            placeholder: "e.g. 2019/123456/07",
          })}
          {!compact && text("trading_name", "Trading name", {
            max: 200,
            placeholder: "If different to the registered name",
          })}
          {!compact && (
            <div className="tvp-form-group">
              <Label htmlFor="client-type">Client type</Label>
              <Select value={form.client_type} onValueChange={(v) => set({ client_type: v })}>
                <SelectTrigger id="client-type" className="tvp-modal-control">
                  <SelectValue placeholder="Select a type…" />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <h3 className="tvp-h3" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            Billing address
          </h3>
          {text("address", "Street address", { max: 500, full: true })}
          {text("address_suburb", "Suburb", { max: 120 })}
          {text("city", "City or town", { max: 120 })}
          <div className="tvp-form-group">
            <Label htmlFor="client-province">Province</Label>
            <Select value={form.province} onValueChange={(v) => set({ province: v })}>
              <SelectTrigger id="client-province" className="tvp-modal-control">
                <SelectValue placeholder="Select a province…" />
              </SelectTrigger>
              <SelectContent>
                {SA_PROVINCES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {text("postal_code", "Postal code", { max: 20 })}
          {text("country", "Country", { max: 120 })}

          {text("payment_terms_days", "Default payment terms (days)", {
            type: "number",
            placeholder: "e.g. 30",
          })}
          {!compact && (
            <div className="tvp-form-group">
              <Label htmlFor="client-manager">Relationship manager</Label>
              <Select
                value={form.relationship_manager_user_id || "none"}
                onValueChange={(v) =>
                  set({ relationship_manager_user_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger id="client-manager" className="tvp-modal-control">
                  <SelectValue placeholder="Select a team member…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {(staff.data ?? []).map((m: any) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!compact && (
            <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                rows={2}
                value={form.notes}
                maxLength={2000}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Anything useful for billing — purchase order rules, preferred terms…"
              />
            </div>
          )}
        </div>
      </div>

      <div className="tvp-modal-foot">
        <button type="button" className="tvp-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="tvp-primary"
          onClick={() => save.mutate()}
          disabled={!canSave}
        >
          {save.isPending ? "Saving…" : form.id ? "Save changes" : "Save client"}
        </button>
      </div>
    </ModalShell>
  );
}
