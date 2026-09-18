import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  listAgencyClients,
  saveAgencyClient,
  removeAgencyClient,
} from "@/lib/agency.functions";
import { ModalShell } from "@/components/shared/modal-shell";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { EmailChipsInput } from "@/components/shared/email-chips-input";
import { SectionHeader } from "@/components/account/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AgencyClient = {
  id: string;
  name: string;
  contact_person: string | null;
  emails: string[] | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
};

type FormState = {
  id?: string;
  name: string;
  contact_person: string;
  emails: string[];
  phone: string;
  address: string;
  vat_number: string;
  city: string;
  country: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    contact_person: "",
    emails: [],
    phone: "",
    address: "",
    vat_number: "",
    city: "",
    country: "",
    notes: "",
  };
}

function toForm(c: AgencyClient): FormState {
  return {
    id: c.id,
    name: c.name ?? "",
    contact_person: c.contact_person ?? "",
    emails: c.emails ?? [],
    phone: c.phone ?? "",
    address: c.address ?? "",
    vat_number: c.vat_number ?? "",
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
  const { data, isLoading, isError, error } = useAgencyClients();
  const saveFn = useServerFn(saveAgencyClient);
  const removeFn = useServerFn(removeAgencyClient);

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AgencyClient | null>(null);
  const [search, setSearch] = useState("");

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact_person ?? "").toLowerCase().includes(q) ||
        (c.emails ?? []).some((e) => e.toLowerCase().includes(q)),
    );
  }, [clients, search]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return null;
      if (!form.name.trim()) throw new Error("Enter the client or company name");
      return saveFn({
        data: {
          id: form.id,
          name: form.name.trim(),
          contact_person: form.contact_person.trim() || null,
          emails: form.emails,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          vat_number: form.vat_number.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "clients"] });
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
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove this client"),
  });

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
          <Plus className="h-4 w-4" /> Add client
        </button>
      </div>

      {clients.length > 0 && (
        <div style={{ marginTop: 14, maxWidth: 320 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, contact or email"
            aria-label="Search clients"
          />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {isLoading ? (
          <div className="tvp-muted">Loading your clients…</div>
        ) : isError ? (
          <div className="tvp-warn">Failed to load: {(error as Error)?.message}</div>
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
        ) : (
          <>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Contact person</th>
                    <th>Email addresses</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th style={{ width: 52 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.contact_person || "—"}</td>
                      <td>
                        {(c.emails ?? []).length === 0
                          ? "—"
                          : (c.emails ?? []).join(", ")}
                      </td>
                      <td>{c.phone || "—"}</td>
                      <td>{c.city || "—"}</td>
                      <td style={{ textAlign: "right" }}>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tvp-muted" style={{ marginTop: 10, fontSize: 12 }}>
              Showing {filtered.length} of {clients.length} client
              {clients.length === 1 ? "" : "s"}
            </div>
          </>
        )}
      </div>

      {form && (
        <ModalShell onClose={() => setForm(null)} maxWidth={620} labelledBy="client-form-title">
          <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
            <h2 className="tvp-h2" id="client-form-title">
              {form.id ? "Edit client" : "Add client"}
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
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                maxLength={40}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+27 82 000 0000"
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
