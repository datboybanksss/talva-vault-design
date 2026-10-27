import { friendlyError } from "./friendly-error";

/** Retain machine-readable refusal codes while redacting their public sentence. */
export function publicFunctionError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = /^([A-Z][A-Z0-9_]{2,})(?::|$)/.exec(raw)?.[1];
  const text = friendlyError(error);
  return new Error(code ? `${code}: ${text}` : text);
}
