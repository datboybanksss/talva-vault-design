import { sendLovableEmail } from "@lovable.dev/email-js";
import { PUBLIC_SITE_URL, emailHeaderHtml } from "@/lib/brand-email";
import type { BillingLine } from "@/lib/billing";
import { computeTotals, fmtMoney } from "@/lib/billing";

export type BillingSendResult =
  | { sent: true; message_id?: string }
  | { sent: false; reason: "email_not_configured" | "domain_unverified" | "send_failed"; detail?: string };

/**
 * The platform sender. Outbound mail can only leave from a domain that has been
 * verified with the email provider, so an agency's own address is used as the
 * Reply-To (and display name) rather than the envelope From.
 */
export function systemFromAddress(): string {
  return process.env["EMAIL_FROM"] ?? "TalVault <invitations@notify.talvault.com>";
}

export function systemFromEmail(): string {
  const m = systemFromAddress().match(/<([^>]+)>/);
  return (m?.[1] ?? systemFromAddress()).trim();
}

/** Display form of the From header actually used for an agency's billing mail. */
export function billingFromHeader(agencyName: string | null | undefined, senderVerified: boolean, senderEmail?: string | null): string {
  const base = systemFromEmail();
  const name = agencyName?.trim() || "TalVault";
  return senderVerified && senderEmail
    ? `${name} (via TalVault) <${base}>`
    : `${name} <${base}>`;
}

async function send(
  to: string,
  from: string,
  replyTo: string | null,
  mail: { subject: string; html: string; text: string },
  idempotencyKey: string,
): Promise<BillingSendResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { sent: false, reason: "email_not_configured" };
  const senderDomain = (from.match(/@([^>\s]+)/)?.[1] ?? "notify.talvault.com").trim();
  try {
    const res = await sendLovableEmail(
      {
        to,
        from,
        sender_domain: senderDomain,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        label: "billing_document",
        purpose: "transactional",
        idempotency_key: idempotencyKey,
      },
      { apiKey, idempotencyKey },
    );
    if (!res.success) return { sent: false, reason: "send_failed", detail: res.status };
    return { sent: true, message_id: res.message_id };
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : undefined;
    const detail = String(e?.message ?? e);
    const domainIssue = status === 403 || /domain|verif|not allowed|sender/i.test(detail);
    return { sent: false, reason: domainIssue ? "domain_unverified" : "send_failed", detail };
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function shell(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2f1ed;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    ${emailHeaderHtml(title)}
    <div style="padding:24px;color:#1c2b2d;font-size:15px;line-height:1.6;">${bodyHtml}</div>
    <div style="padding:16px 24px;border-top:1px solid #e7e5df;color:#6b7a7c;font-size:12px;">Sent securely through TalVault.</div>
  </div></body></html>`;
}

/** Verification mail for an agency's chosen billing "send from" address. */
export async function sendSenderVerificationEmail(
  to: string,
  agencyName: string,
  token: string,
): Promise<BillingSendResult> {
  const url = `${PUBLIC_SITE_URL}/api/public/verify-billing-sender?token=${encodeURIComponent(token)}`;
  const subject = `Verify ${to} as a sending address for ${agencyName}`;
  const html = shell(
    "Verify sending address",
    `<p>Hello,</p>
     <p><strong>${esc(agencyName)}</strong> would like to use <strong>${esc(to)}</strong> as the reply address on quotes and invoices sent from TalVault.</p>
     <p style="margin:24px 0;"><a href="${url}" style="background:#0d6d78;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Verify this address</a></p>
     <p style="color:#6b7a7c;font-size:13px;">This link expires in 24 hours. If you were not expecting it, you can ignore this email.</p>`,
  );
  const text = `${agencyName} would like to use ${to} on quotes and invoices sent from TalVault.\n\nVerify: ${url}\n\nThis link expires in 24 hours.`;
  return send(to, systemFromAddress(), null, { subject, html, text }, `billing-sender-${token}`);
}

/** The quote/invoice email itself, sent to one recipient. */
export async function sendBillingDocEmail(opts: {
  to: string;
  from: string;
  replyTo: string | null;
  agencyName: string;
  kind: "quote" | "invoice";
  number: string;
  clientName: string | null;
  amount: string;
  dueDate: string | null;
  notes: string | null;
  issuedAt?: string;
  recipientAddress?: string | null;
  recipientVatNumber?: string | null;
  currency?: string;
  lines?: BillingLine[];
  agency?: {
    billingAddress: string | null;
    contactEmail: string | null;
    phone: string | null;
    isVatRegistered: boolean;
    vatNumber: string | null;
    accentColor: string | null;
    /** Banking block; supplied for invoices only, never for quotations. */
    paymentDetails?: {
      bankName: string | null;
      accountHolder: string | null;
      accountNumber: string | null;
      branchCode: string | null;
      instructions: string | null;
    } | null;
  };
  idempotencyKey: string;
}): Promise<BillingSendResult> {
  const label = opts.kind === "quote" ? "Quotation" : "Invoice";
  const subject = `${label} ${opts.number} from ${opts.agencyName}`;
  const dueLine =
    opts.dueDate
      ? `<p><strong>${opts.kind === "quote" ? "Valid until" : "Payment due"}:</strong> ${esc(opts.dueDate)}</p>`
      : "";
  const lines = opts.lines ?? [];
  const totals = computeTotals(lines);
  const accent = /^#[0-9a-f]{6}$/i.test(opts.agency?.accentColor ?? "")
    ? opts.agency?.accentColor ?? "#086a70"
    : "#086a70";
  const detailHtml = lines.length > 0
    ? `<div style="margin:24px 0;border:1px solid #e7e5df;border-radius:6px;overflow:hidden;">
        <div style="padding:16px 18px;border-bottom:3px solid ${esc(accent)};display:flex;justify-content:space-between;gap:16px;">
          <div><strong style="font-size:18px;">${esc(opts.agencyName)}</strong>${opts.agency?.billingAddress ? `<div style="white-space:pre-line;color:#5b6769;font-size:12px;">${esc(opts.agency.billingAddress)}</div>` : ""}${opts.agency?.contactEmail ? `<div style="color:#5b6769;font-size:12px;">${esc(opts.agency.contactEmail)}</div>` : ""}${opts.agency?.phone ? `<div style="color:#5b6769;font-size:12px;">${esc(opts.agency.phone)}</div>` : ""}</div>
          <div style="text-align:right;"><strong>Quotation ${esc(opts.number)}</strong>${opts.issuedAt ? `<div style="font-size:12px;color:#5b6769;">Issued ${esc(opts.issuedAt)}</div>` : ""}</div>
        </div>
        <div style="padding:14px 18px;background:#faf9f6;">
          <strong>Prepared for ${esc(opts.clientName || "Client")}</strong>
          ${opts.recipientAddress ? `<div style="white-space:pre-line;font-size:12px;color:#5b6769;">${esc(opts.recipientAddress)}</div>` : ""}
          ${opts.recipientVatNumber ? `<div style="font-size:12px;color:#5b6769;">VAT number: ${esc(opts.recipientVatNumber)}</div>` : ""}
        </div>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f2f1ed;color:#465456;">
            <th style="padding:9px 12px;text-align:left;">Description</th><th style="padding:9px 12px;text-align:right;">Qty</th><th style="padding:9px 12px;text-align:right;">Unit price</th><th style="padding:9px 12px;text-align:right;">VAT</th><th style="padding:9px 12px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>${lines.map((line) => {
            const base = Math.round(line.quantity * line.unit_price_cents);
            const vat = Math.round(base * line.vat_rate_bp / 10000);
            return `<tr style="border-top:1px solid #e7e5df;"><td style="padding:10px 12px;">${esc(line.description)}</td><td style="padding:10px 12px;text-align:right;">${line.quantity}</td><td style="padding:10px 12px;text-align:right;">${esc(fmtMoney(line.unit_price_cents, opts.currency))}</td><td style="padding:10px 12px;text-align:right;">${(line.vat_rate_bp / 100).toFixed(2)}%</td><td style="padding:10px 12px;text-align:right;">${esc(fmtMoney(base + vat, opts.currency))}</td></tr>`;
          }).join("")}</tbody>
        </table>
        <div style="padding:14px 18px;border-top:1px solid #e7e5df;text-align:right;">
          <div>Subtotal: <strong>${esc(fmtMoney(totals.subtotal_cents, opts.currency))}</strong></div>
          <div>VAT: <strong>${esc(fmtMoney(totals.vat_cents, opts.currency))}</strong></div>
          <div style="font-size:18px;margin-top:4px;">Total: <strong>${esc(fmtMoney(totals.total_cents, opts.currency))}</strong></div>
        </div>
        ${opts.agency?.isVatRegistered && opts.agency.vatNumber ? `<div style="padding:10px 18px;border-top:1px solid #e7e5df;color:#5b6769;font-size:12px;">Agency VAT number: ${esc(opts.agency.vatNumber)}</div>` : ""}
      </div>`
    : `<p style="font-size:22px;font-weight:700;margin:16px 0;">${esc(opts.amount)}</p>`;
  const html = shell(
    label,
    `<p>Hello${opts.clientName ? ` ${esc(opts.clientName)}` : ""},</p>
     <p>Please find ${opts.kind === "quote" ? "the quotation" : "the invoice"} <strong>${esc(opts.number)}</strong> from <strong>${esc(opts.agencyName)}</strong> below.</p>
     ${detailHtml}
     ${dueLine}
     ${opts.notes ? `<p style="color:#4a5b5d;">${esc(opts.notes)}</p>` : ""}
     <p style="color:#6b7a7c;font-size:13px;">Reply to this email to reach ${esc(opts.agencyName)} directly.</p>`,
  );
  const lineText = lines.map((line) => {
    const base = Math.round(line.quantity * line.unit_price_cents);
    const vat = Math.round(base * line.vat_rate_bp / 10000);
    return `${line.description} — ${line.quantity} × ${fmtMoney(line.unit_price_cents, opts.currency)} — ${fmtMoney(base + vat, opts.currency)}`;
  }).join("\n");
  const text = `${label} ${opts.number} from ${opts.agencyName}\n${opts.issuedAt ? `Issued: ${opts.issuedAt}\n` : ""}${opts.dueDate ? `${opts.kind === "quote" ? "Valid until" : "Due"}: ${opts.dueDate}\n` : ""}${lineText ? `\n${lineText}\n\nSubtotal: ${fmtMoney(totals.subtotal_cents, opts.currency)}\nVAT: ${fmtMoney(totals.vat_cents, opts.currency)}\nTotal: ${fmtMoney(totals.total_cents, opts.currency)}` : `Amount: ${opts.amount}`}${opts.notes ? `\n\n${opts.notes}` : ""}\n\nReply to this email to reach ${opts.agencyName} directly.`;
  return send(opts.to, opts.from, opts.replyTo, { subject, html, text }, opts.idempotencyKey);
}
