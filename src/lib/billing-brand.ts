// The existing TalVault teal billing preset and database default.
export const DEFAULT_BILLING_ACCENT = "#064E58";

export function billingAccent(value: string | null): string {
  return value ?? DEFAULT_BILLING_ACCENT;
}
