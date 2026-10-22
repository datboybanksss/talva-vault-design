// Shared billing helpers — safe to import from client and server.

export type BillingLine = {
  id?: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate_bp: number; // basis points; 1500 = 15.00%
  sort_order: number;
};

/**
 * Money as shown everywhere in TalVault. Rand uses the South African style
 * "R 12 500,00" (space thousands, comma decimals) regardless of the browser's
 * locale data; other currencies fall back to Intl.
 */
export function fmtMoney(cents: number, currency = "ZAR") {
  if (currency === "ZAR") {
    const neg = cents < 0;
    const abs = Math.round(Math.abs(cents));
    const whole = Math.floor(abs / 100)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
    const frac = String(abs % 100).padStart(2, "0");
    return `${neg ? "-" : ""}R\u00a0${whole},${frac}`;
  }
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
