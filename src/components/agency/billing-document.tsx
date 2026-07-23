import type React from "react";
import type { BillingLine } from "@/lib/billing";
import { computeTotals, fmtMoney } from "@/lib/billing";

export type BillingDocAgency = {
  name: string;
  contact_email: string | null;
  phone: string | null;
  country: string | null;
  business_type: string | null;
  billing_address: string | null;
  is_vat_registered: boolean | null;
  vat_number: string | null;
  main_contact_first_name: string | null;
  main_contact_last_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  logo_url: string | null;
  accent_color: string | null;
  default_invoice_payment_days?: number | null;
  default_quote_acceptance_days?: number | null;
};

export type BillingDocRecord = {
  kind: "quote" | "invoice";
  number: string;
  client_name: string | null;
  recipient_address: string | null;
  recipient_vat_number: string | null;
  recipient_email: string | null;
  talent_name: string | null;
  description: string | null;
  issued_at: string;
  due_date: string | null;
  currency: string;
  notes: string | null;
  status: string;
  acceptance_window_days: number | null;
  payment_terms_days: number | null;
};

const cellHead: React.CSSProperties = {
  padding: "8px 10px", textAlign: "left", fontSize: 11,
  textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700,
};
const cell: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };

export function BillingDocument({
  doc, lines, agency,
}: { doc: BillingDocRecord; lines: BillingLine[]; agency: BillingDocAgency }) {
  const totals = computeTotals(lines);
  const accent = agency.accent_color || "#064E58";
  const isVat = !!agency.is_vat_registered;
  const showVatCol = lines.some((l) => l.vat_rate_bp > 0);
  const heading =
    doc.kind === "quote"
      ? "Quotation"
      : isVat
      ? "Tax Invoice"
      : "Invoice";
  const isDraft = doc.number.startsWith("DRAFT-");
  const smallInvoice = doc.kind === "invoice" && totals.total_cents < 500000; // < R5000

  return (
    <div
      className="billing-doc"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111",
        background: "#fff",
        padding: "32px 36px",
        maxWidth: 820,
        margin: "0 auto",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {isDraft && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            color: "#92400e",
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          DRAFT — final number will be assigned when marked as sent
        </div>
      )}

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: `3px solid ${accent}`,
          paddingBottom: 16,
          gap: 24,
        }}
      >
        <div style={{ flex: 1 }}>
          {agency.logo_url ? (
            <img
              src={agency.logo_url}
              alt=""
              style={{ maxHeight: 72, maxWidth: 240, marginBottom: 8, objectFit: "contain" }}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>
              {agency.name}
            </div>
          )}
          {agency.logo_url && (
            <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 4 }}>
              {agency.name}
            </div>
          )}
          {agency.billing_address && (
            <div style={{ fontSize: 12, color: "#555", whiteSpace: "pre-line", marginTop: 4 }}>
              {agency.billing_address}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
            {agency.contact_email && <div>{agency.contact_email}</div>}
            {agency.phone && <div>{agency.phone}</div>}
            {isVat && agency.vat_number && (
              <div>
                <strong>VAT No:</strong> {agency.vat_number}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: accent,
              letterSpacing: 0.5,
            }}
          >
            {heading}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
            {doc.number}
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
            <div>
              <strong>Issued:</strong> {doc.issued_at}
            </div>
            {doc.due_date && (
              <div>
                <strong>
                  {doc.kind === "quote" ? "Valid until" : "Due"}:
                </strong>{" "}
                {doc.due_date}
              </div>
            )}
          </div>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginTop: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              color: "#888",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {doc.kind === "quote" ? "Prepared for" : "Bill to"}
          </div>
          <div style={{ fontWeight: 700 }}>{doc.client_name || "—"}</div>
          {doc.recipient_address && (
            <div style={{ whiteSpace: "pre-line", fontSize: 12, color: "#555" }}>
              {doc.recipient_address}
            </div>
          )}
          {doc.recipient_email && (
            <div style={{ fontSize: 12, color: "#555" }}>{doc.recipient_email}</div>
          )}
          {doc.recipient_vat_number && (
            <div style={{ fontSize: 12, color: "#555" }}>
              <strong>VAT No:</strong> {doc.recipient_vat_number}
            </div>
          )}
          {doc.kind === "invoice" && !smallInvoice && !doc.recipient_address && (
            <div
              style={{
                fontSize: 11,
                color: "#b45309",
                marginTop: 4,
                fontStyle: "italic",
              }}
            >
              SARS requires the recipient's address for invoices over R5,000.
            </div>
          )}
        </div>
        <div>
          {doc.talent_name && (
            <>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#888",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Talent
              </div>
              <div style={{ fontWeight: 600 }}>{doc.talent_name}</div>
            </>
          )}
          {doc.description && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#888",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Reference
              </div>
              <div>{doc.description}</div>
            </div>
          )}
        </div>
      </section>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 24,
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ background: accent, color: "#fff" }}>
            <th style={cellHead}>Description</th>
            <th style={{ ...cellHead, textAlign: "right", width: 60 }}>Qty</th>
            <th style={{ ...cellHead, textAlign: "right", width: 110 }}>
              Unit price (excl.)
            </th>
            {showVatCol && (
              <th style={{ ...cellHead, textAlign: "right", width: 70 }}>VAT %</th>
            )}
            <th style={{ ...cellHead, textAlign: "right", width: 120 }}>
              Line total (excl.)
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const line = Math.round(l.quantity * l.unit_price_cents);
            return (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={cell}>{l.description || "—"}</td>
                <td style={{ ...cell, textAlign: "right" }}>{l.quantity}</td>
                <td style={{ ...cell, textAlign: "right" }}>
                  {fmtMoney(l.unit_price_cents, doc.currency)}
                </td>
                {showVatCol && (
                  <td style={{ ...cell, textAlign: "right" }}>
                    {(l.vat_rate_bp / 100).toFixed(2)}%
                  </td>
                )}
                <td style={{ ...cell, textAlign: "right" }}>
                  {fmtMoney(line, doc.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <table style={{ fontSize: 13, minWidth: 320 }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 12px", color: "#555" }}>
                Subtotal (excl. VAT)
              </td>
              <td
                style={{
                  padding: "4px 0",
                  textAlign: "right",
                  fontWeight: 600,
                }}
              >
                {fmtMoney(totals.subtotal_cents, doc.currency)}
              </td>
            </tr>
            {[...totals.byRate.entries()]
              .filter(([r]) => r > 0)
              .map(([rate, amt]) => (
                <tr key={rate}>
                  <td style={{ padding: "4px 12px", color: "#555" }}>
                    VAT @ {(rate / 100).toFixed(2)}%
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {fmtMoney(amt, doc.currency)}
                  </td>
                </tr>
              ))}
            <tr style={{ borderTop: `2px solid ${accent}` }}>
              <td
                style={{
                  padding: "8px 12px",
                  fontWeight: 800,
                  color: accent,
                }}
              >
                Total{" "}
                {isVat && totals.vat_cents > 0 ? "(incl. VAT)" : ""}
              </td>
              <td
                style={{
                  padding: "8px 0",
                  textAlign: "right",
                  fontWeight: 800,
                  fontSize: 15,
                  color: accent,
                }}
              >
                {fmtMoney(totals.total_cents, doc.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {doc.notes && (
        <section
          style={{
            marginTop: 24,
            padding: 12,
            background: "#f7f7f5",
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: "pre-line",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Notes</div>
          {doc.notes}
        </section>
      )}

      <footer
        style={{
          marginTop: 32,
          paddingTop: 12,
          borderTop: "1px solid #ddd",
          fontSize: 11,
          color: "#777",
          textAlign: "center",
        }}
      >
        {doc.kind === "quote"
          ? `This quotation is valid for ${
              doc.acceptance_window_days ??
              agency.default_quote_acceptance_days ??
              14
            } days from the issue date.`
          : `Payment is due within ${
              doc.payment_terms_days ??
              agency.default_invoice_payment_days ??
              30
            } days of the issue date.`}
        {isVat && doc.kind === "invoice" && agency.vat_number && (
          <div style={{ marginTop: 4 }}>
            Registered for VAT — VAT number {agency.vat_number}
          </div>
        )}
      </footer>
    </div>
  );
}
