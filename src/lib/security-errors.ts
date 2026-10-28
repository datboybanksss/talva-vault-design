import { friendlyError } from "./friendly-error";
import { invoiceNumberExistsError, isInvoiceNumberUniqueViolation } from "./billing-number";

/** Database detail stays in server logs; only deliberate rule messages survive. */
export function databaseError(
  error:
    | { message?: string; code?: string; details?: string; constraint?: string }
    | null
    | undefined,
  fallback = "We couldn't complete that request. Please try again.",
): Error {
  console.error("[database-request]", { code: error?.code, message: error?.message });
  if (isInvoiceNumberUniqueViolation(error)) return invoiceNumberExistsError();
  const deliberate =
    error?.message && (/^[A-Z][A-Z0-9_]{2,}:/.test(error.message) || error.code === "P0001");
  const safe = friendlyError(error, fallback);
  return new Error(deliberate || safe !== error?.message?.trim() ? safe : fallback);
}
