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
