import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgencyClientDetail } from "@/lib/agency.functions";
import { EntityAvatar } from "@/components/shared/entity-card";
import { BILLING_DOC_STATUS_LABEL, BILLING_DOC_STATUS_TONE } from "@/lib/status-labels";
import { fmtMoney } from "@/lib/billing";
import { formatClientAddress } from "@/lib/client-duplicates";
import { friendlyError } from "@/lib/friendly-error";
import { fmtShortDate } from "@/components/agency/clients-panel";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = !value || !String(value).trim();
  return (
    <div className="tvp-detail-row">
      <dt>{label}</dt>
      <dd className={empty ? "tvp-detail-empty" : undefined}>{empty ? "Not provided" : value}</dd>
    </div>
  );
}

export function useClientDetail(clientId: string) {
  const detailFn = useServerFn(getAgencyClientDetail);
  return useQuery({
    queryKey: ["agency", "client-detail", clientId],
    queryFn: () => detailFn({ data: { id: clientId } }) as Promise<any>,
  });
}

/** Client details plus every quote and invoice issued to them. */
export function ClientDetailView({ clientId }: { clientId: string }) {
  const { data, isLoading, isError, error, refetch } = useClientDetail(clientId);
  const client = data?.client;
  const documents: any[] = data?.documents ?? [];
  const stats = client?.stats;

  if (isLoading) return <div className="tvp-muted">Loading this client…</div>;
  if (isError || !client)
    return (
      <div className="tvp-empty">
        <h3 className="tvp-h3">This client could not be loaded</h3>
        <p className="tvp-muted">{friendlyError(error, "Something went wrong.")}</p>
        <button type="button" className="tvp-secondary" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );

  return (
    <>
      <div className="tvp-card tvp-panel">
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <EntityAvatar name={client.name} size="lg" />
          <div>
            <div className="tvp-entity-name">
              {client.name}
              {client.archived_at && (
                <span className="tvp-status tvp-neutral" style={{ marginLeft: 8 }}>
                  Archived
                </span>
              )}
            </div>
            <div className="tvp-entity-sub">
              {[client.client_type, client.trading_name ? `trading as ${client.trading_name}` : null]
                .filter(Boolean)
                .join(" · ") || "Client"}
            </div>
            <div className="tvp-entity-meta">
              Client since {fmtShortDate(client.created_at) ?? "—"}
            </div>
          </div>
        </div>

        <div className="tvp-entity-stats" style={{ marginTop: 18 }}>
          <div className="tvp-entity-stat">
            <span className="tvp-entity-stat-value">{fmtMoney(stats?.invoicedCents ?? 0)}</span>
            <span className="tvp-entity-stat-label">Invoiced</span>
          </div>
          <div className="tvp-entity-stat">
            <span className="tvp-entity-stat-value tvp-entity-stat-green">
              {fmtMoney(stats?.paidCents ?? 0)}
            </span>
            <span className="tvp-entity-stat-label">Paid</span>
          </div>
          <div className="tvp-entity-stat">
            <span
              className={`tvp-entity-stat-value${(stats?.overdueCents ?? 0) > 0 ? " tvp-entity-stat-red" : ""}`}
            >
              {fmtMoney(stats?.overdueCents ?? 0)}
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
              <Row label="Registration number" value={client.company_registration_number} />
              <Row label="VAT number" value={client.vat_number} />
            </dl>
          </section>
          <section>
            <h3 className="tvp-h3">Contact</h3>
            <dl className="tvp-detail-rows">
              <Row label="Contact person" value={client.contact_person} />
              <Row label="Email" value={(client.emails ?? []).join(", ")} />
              <Row label="Phone" value={client.phone} />
            </dl>
          </section>
          <section>
            <h3 className="tvp-h3">Billing</h3>
            <dl className="tvp-detail-rows">
              <Row label="Billing address" value={formatClientAddress(client)} />
              <Row
                label="Default payment terms"
                value={client.payment_terms_days != null ? `${client.payment_terms_days} days` : null}
              />
              <Row label="Relationship manager" value={client.relationship_manager_name} />
              <Row label="Notes" value={client.notes} />
            </dl>
          </section>
        </div>
      </div>

      <div className="tvp-card tvp-panel" style={{ marginTop: "var(--sp-16, 16px)" }}>
        <h2 className="tvp-h3">Quotes and invoices</h2>
        {documents.length === 0 ? (
          <p className="tvp-muted" style={{ marginTop: 6 }}>
            No quotes or invoices for this client yet.
          </p>
        ) : (
          <div className="tvp-table-wrap" style={{ marginTop: 10 }}>
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th className="tvp-nowrap">Issued</th>
                  <th className="tvp-nowrap">Due</th>
                  <th>Status</th>
                  <th className="tvp-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to="/agency/quotes-invoices" search={{ doc: d.number }} className="tvp-link">
                        {d.kind === "quote" ? "Quote" : "Invoice"} {d.number}
                      </Link>
                      {d.description ? <div className="tvp-muted">{d.description}</div> : null}
                    </td>
                    <td className="tvp-nowrap">{fmtShortDate(d.issuedAt) ?? "—"}</td>
                    <td className="tvp-nowrap">{fmtShortDate(d.dueDate) ?? "—"}</td>
                    <td>
                      <span
                        className={`tvp-status tvp-${(BILLING_DOC_STATUS_TONE as any)[d.status] ?? "neutral"}`}
                      >
                        {(BILLING_DOC_STATUS_LABEL as any)[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="tvp-num">{fmtMoney(d.totalCents, d.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
