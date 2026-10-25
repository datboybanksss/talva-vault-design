import { z } from "zod";

export const acceptTermsInput = z.object({
  portal: z.enum(["talent", "agency"]),
  document_id: z.string().uuid(),
  body_sha256: z.string().max(10000).regex(/^[a-f0-9]{64}$/),
});

export function reachedDocumentEnd(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return clientHeight > 0 && Math.ceil(scrollTop + clientHeight) >= scrollHeight;
}

export const TERMS_INVALID_INPUT_MESSAGE =
  "We couldn't verify this Terms document. Please reload the page and try again.";
export const TERMS_UPDATED_MESSAGE =
  "These Terms have been updated. Please reload the page and read the latest version.";
export const TERMS_RECORD_FAILED_MESSAGE = "We couldn't record your acceptance. Please try again.";

/** Server-side input check: a genuine ID/hash problem becomes one plain, known sentence. */
export function parseAcceptTermsInput(v: unknown) {
  const r = acceptTermsInput.safeParse(v);
  if (!r.success) throw new Error(TERMS_INVALID_INPUT_MESSAGE);
  return r.data;
}

/**
 * Only the exact known sentences are shown; anything else (database errors,
 * network, permissions) gets the plain "couldn't record" message.
 */
export function termsGateError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  if (message === TERMS_INVALID_INPUT_MESSAGE) return TERMS_INVALID_INPUT_MESSAGE;
  if (message.startsWith("These Terms have been updated.")) return TERMS_UPDATED_MESSAGE;
  return TERMS_RECORD_FAILED_MESSAGE;
}
export type TermsGateView = "loading" | "error" | "accepted" | "needs_acceptance";

/**
 * Three-state gate decision. Only a confirmed server answer that acceptance is
 * required shows the gate; unknown (loading) and failed reads never do.
 */
export function termsGateView(s: {
  isPending: boolean;
  isError: boolean;
  data?: { required?: boolean; current?: unknown } | null;
}): TermsGateView {
  if (s.data) return s.data.required && s.data.current ? "needs_acceptance" : "accepted";
  if (s.isError) return "error";
  return "loading";
}

/**
 * User IDs that belong to Test accounts: talent marked Test, plus every member
 * of an agency marked Test. Terms acceptance reports leave these out (the
 * acceptances themselves are still recorded with the normal proof stamp).
 */
export function testUserIds(
  talent: { user_id: string | null; is_test: boolean | null }[],
  members: { user_id: string; agency_id: string }[],
  testAgencyIds: Iterable<string>,
): Set<string> {
  const agencies = new Set(testAgencyIds);
  const out = new Set<string>();
  for (const t of talent) if (t.is_test && t.user_id) out.add(t.user_id);
  for (const m of members) if (agencies.has(m.agency_id)) out.add(m.user_id);
  return out;
}
