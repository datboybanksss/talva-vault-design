/** Draft labels are identifiers, not access credentials; six base-32 characters provide 30 random bits. */
export function createDraftBillingNumber(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `DRAFT-${Array.from(bytes, (byte) => alphabet[byte & 31]).join("")}`;
}