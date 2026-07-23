// Shared billing helpers — safe to import from client and server.

export type BillingLine = {
  id?: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate_bp: number; // basis points; 1500 = 15.00%
  sort_order: number;
};

export function fmtMoney(cents: number, currency = "ZAR") {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function computeTotals(lines: BillingLine[]) {
  let subtotal = 0;
  let vat = 0;
  const byRate = new Map<number, number>();
  for (const l of lines) {
    const line = Math.round((Number(l.quantity) || 0) * (Number(l.unit_price_cents) || 0));
    subtotal += line;
    const lineVat = Math.round((line * (Number(l.vat_rate_bp) || 0)) / 10000);
    vat += lineVat;
    byRate.set(l.vat_rate_bp, (byRate.get(l.vat_rate_bp) ?? 0) + lineVat);
  }
  return {
    subtotal_cents: subtotal,
    vat_cents: vat,
    total_cents: subtotal + vat,
    byRate,
  };
}

export function emptyLine(sort_order = 0, defaultVatBp = 1500): BillingLine {
  return {
    description: "",
    quantity: 1,
    unit_price_cents: 0,
    vat_rate_bp: defaultVatBp,
    sort_order,
  };
}
