import { friendlyError } from "./friendly-error";

/** Database detail stays in server logs; only deliberate rule messages survive. */
export function databaseError(error: { message?: string; code?: string } | null | undefined, fallback = "We couldn't complete that request. Please try again."): Error {
  console.error("[database-request]", { code: error?.code, message: error?.message });
  const deliberate = error?.message && (/^[A-Z][A-Z0-9_]{2,}:/.test(error.message) || error.code === "P0001");
  return new Error(deliberate ? friendlyError(error, fallback) : fallback);
}