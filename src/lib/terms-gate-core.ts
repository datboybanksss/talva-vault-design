import { z } from "zod";

export const acceptTermsInput = z.object({
  portal: z.enum(["talent", "agency"]),
  document_id: z.string().uuid(),
  body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export function reachedDocumentEnd(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return clientHeight > 0 && Math.ceil(scrollTop + clientHeight) >= scrollHeight;
}

export function termsGateError(error: unknown): string {
  const fallback = "We couldn't record your acceptance. Please try again.";
  const message = error instanceof Error ? error.message : "";
  if (/invalid_string|invalid_type|Zod|document_id|body_sha256|"code"\s*:/.test(message)) {
    return "We couldn't verify this Terms document. Please reload the page and try again.";
  }
  if (message.startsWith("These Terms have been updated.")) return message;
  return fallback;
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
