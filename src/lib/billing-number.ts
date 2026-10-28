export const INVOICE_NUMBER_UNIQUE_INDEX = "agency_billing_docs_invoice_number_unique";
export const INVOICE_NUMBER_EXISTS_MESSAGE =
  "This agency already has an invoice with that number. Please choose a different number.";

export function invoiceNumberExistsError(): Error {
  return new Error(`INVOICE_NUMBER_EXISTS: ${INVOICE_NUMBER_EXISTS_MESSAGE}`);
}

export function isInvoiceNumberUniqueViolation(
  error:
    | { code?: string; message?: string; details?: string; constraint?: string }
    | null
    | undefined,
): boolean {
  return (
    error?.code === "23505" &&
    (error.constraint === INVOICE_NUMBER_UNIQUE_INDEX ||
      [error.message, error.details].some((text) => text?.includes(INVOICE_NUMBER_UNIQUE_INDEX)))
  );
}

/** Draft labels are identifiers, not access credentials; six base-32 characters provide 30 random bits. */
export function createDraftBillingNumber(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `DRAFT-${Array.from(bytes, (byte) => alphabet[byte & 31]).join("")}`;
}
