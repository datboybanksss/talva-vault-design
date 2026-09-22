import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, X } from "lucide-react";
import { getAgencyClientDetail } from "@/lib/agency.functions";
import { ModalShell } from "@/components/shared/modal-shell";
import { EntityAvatar } from "@/components/shared/entity-card";
import { Button } from "@/components/ui/button";
import { BILLING_DOC_STATUS_LABEL, BILLING_DOC_STATUS_TONE } from "@/lib/status-labels";

export function money(cents: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

export function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = !value || !String(value).trim();
  return (
    <div className="tvp-detail-row">
      <dt>{label}</dt>
      <dd className={empty ? "tvp-detail-empty" : undefined}>{empty ? "Not provided" : value}</dd>
    </div>
  );
}

export function ClientDetailPanel({
  clientId,
  onClose,
  onEdit,
}: {
  clientId: string;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const detailFn = useServerFn(getAgencyClientDetail);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["agency", "client-detail", clientId],
    queryFn: () => detailFn({ data: { id: clientId } }) as Promise<any>,
  });

  const client = data?.client;
  const documents: any[] = data?.documents ?? [];
  const stats = client?.stats;

  return (
    <ModalShell onClose={onClose} maxWidth={860} labelledBy="client-detail-title">
      <div className="tvp-modal-head">
        <h2 className="tvp-h2" id="client-detail-title">
          {client?.name ?? "Client"}
        </h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <div className="tvp-modal-body">
        {isLoading ? (
          <div className="tvp-muted">Loading this client…</div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: "24px 8px" }}>
            <h3 className="tvp-h3">This client could not be loaded</h3>
            <p className="tvp-muted" style={{ marginTop: 6 }}>
              {(error as Error)?.message ?? "Something went wrong."}
            </p>
            <button type="button" className="tvp-secondary" style={{ marginTop: 12 }} onClick={() => refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <EntityAvatar name={client.name} size="lg" />
              <div>
                <div className="tvp-entity-name" style={{ fontSize: 18 }}>{client.name}</div>
                <div className="tvp-entity-sub">
                  {client.client_type || "Client type not set"}
                  {client.trading_name ? ` · trading as ${client.trading_name}` : ""}
                </div>
                <div className="tvp-entity-meta">
                  Client since {fmtDate(client.created_at) ?? "—"}
                </div>
              </div>
            </div>

            <div className="tvp-entity-stats" style={{ marginTop: 18 }}>
              <div className="tvp-entity-stat">
                <span className="tvp-entity-stat-value">{money(stats?.invoicedCents ?? 0)}</span>
                <span className="tvp-entity-stat-label">Invoiced</span>
              </div>
              <div className="tvp-entity-stat">
                <span className="tvp-entity-stat-value tvp-entity-stat-green">{money(stats?.paidCents ?? 0)}</span>
                <span className="tvp-entity-stat-label">Paid</span>
              </div>
              <div className="tvp-entity-stat">
                <span
                  className={`tvp-entity-stat-value${(stats?.overdueCents ?? 0) > 0 ? " tvp-entity-stat-red" : ""}`}
                >
                  {money(stats?.overdueCents ?? 0)}
                </span>
                <span className="tvp-entity-stat-label">Overdue</span>
              </div>
            </div>

            <div className="tvp-detail-sections">
              <section>
                <h3 className="tvp-h3">Company</h3>
                <dl className="tvp-detail-rows">
                  <Row label="Registered name" value={client.name} />
                  <Row label="Trading name" value={client.trading_name} />
                  <Row label="Client type" value={client.client_type} />
                  <Row label="Registration number" value={client.company_registration_number} />
                  <Row label="VAT number" value={client.vat_number} />
                </dl>
              </section>

              <section>
                <h3 className="tvp-h3">Primary contact</h3>
                <dl className="tvp-detail-rows">
                  <Row label="Contact person" value={client.contact_person} />
                  <Row label="Role" value={client.contact_title} />
                  <Row label="Email addresses" value={(client.emails ?? []).join(", ")} />
                  <Row label="Phone" value={client.phone} />
                </dl>
              </section>

              <section>
                <h3 className="tvp-h3">Billing</h3>
                <dl className="tvp-detail-rows">
                  <Row
                    label="Payment terms"
                    value={
                      client.payment_terms_days != null
                        ? `${client.payment_terms_days} days`
                        : null
                    }
                  />
                  <Row label="Billing address" value={client.address} />
                  <Row
                    label="City and country"
                    value={[client.city, client.country].filter(Boolean).join(", ")}
                  />
                  <Row label="Relationship manager" value={client.relationship_manager_name} />
                  <Row label="Notes" value={client.notes} />
                </dl>
              </section>
            </div>

            <section style={{ marginTop: 22 }}>
              <h3 className="tvp-h3">Quotes and invoices</h3>
              {documents.length === 0 ? (
                <p className="tvp-muted" style={{ marginTop: 6 }}>
                  Nothing has been issued to this client yet.
                </p>
              ) : (
                <div className="tvp-table-wrap" style={{ marginTop: 10 }}>
                  <table className="tvp-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Issued</th>
                        <th>Due</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <Link
                              to="/agency/quotes-invoices"
                              search={{ doc: d.number }}
                              className="tvp-link"
                            >
                              {d.kind === "quote" ? "Quote" : "Invoice"} {d.number}
                            </Link>
                            {d.description ? (
                              <div className="tvp-muted" style={{ fontSize: 12 }}>{d.description}</div>
                            ) : null}
                          </td>
                          <td>{fmtDate(d.issuedAt) ?? "—"}</td>
                          <td>{fmtDate(d.dueDate) ?? "—"}</td>
                          <td>
                            <span
                              className={`tvp-status tvp-${(BILLING_DOC_STATUS_TONE as any)[d.status] ?? "neutral"}`}
                            >
                              {(BILLING_DOC_STATUS_LABEL as any)[d.status] ?? d.status}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>{money(d.totalCents, d.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <div className="tvp-modal-foot">
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        {client && (
          <Button type="button" onClick={() => onEdit(client.id)}>
            <Pencil className="h-4 w-4" /> Edit client
          </Button>
        )}
      </div>
    </ModalShell>
  );
}
