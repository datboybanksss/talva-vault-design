/**
 * Client book duplicate rule: a client clashes with another client in the SAME
 * agency when the name, any email address or the VAT number matches
 * (trimmed, case-insensitive; spaces ignored in VAT numbers). Archived clients
 * still count — re-adding them should prompt a restore instead.
 */
export type ClientDupInput = {
  id?: string | null;
  name?: string | null;
  emails?: string[] | null;
  vat_number?: string | null;
};

export type ClientDupRow = {
  id: string;
  name: string;
  emails: string[] | null;
  vat_number: string | null;
  archived_at?: string | null;
};

export type ClientDuplicates = {
  name: ClientDupRow | null;
  email: ClientDupRow | null;
  vat_number: ClientDupRow | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normVat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toLowerCase();

export function findClientDuplicates(
  input: ClientDupInput,
  existing: ClientDupRow[],
): ClientDuplicates {
  const others = existing.filter((c) => c.id !== input.id);
  const name = norm(input.name);
  const emails = new Set((input.emails ?? []).map(norm).filter(Boolean));
  const vat = normVat(input.vat_number);
  return {
    name: name ? (others.find((c) => norm(c.name) === name) ?? null) : null,
    email: emails.size
      ? (others.find((c) => (c.emails ?? []).some((e) => emails.has(norm(e)))) ?? null)
      : null,
    vat_number: vat ? (others.find((c) => normVat(c.vat_number) === vat) ?? null) : null,
  };
}

export function duplicateMessage(field: keyof ClientDuplicates, row: ClientDupRow): string {
  const where = row.archived_at ? ` (archived — restore them from Clients instead)` : "";
  if (field === "name") return `A client called “${row.name}” already exists${where}.`;
  if (field === "email") return `This email address is already saved for ${row.name}${where}.`;
  return `This VAT number is already saved for ${row.name}${where}.`;
}

/** Fields a South African tax invoice needs from the recipient (VAT Act s20(4)). */
export function formatClientAddress(c: {
  address?: string | null;
  address_suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  return [c.address, c.address_suburb, c.city, c.province, c.postal_code, c.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
