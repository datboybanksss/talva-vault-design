import { createFileRoute } from "@tanstack/react-router";
import { billingSenderPage as page } from "@/lib/billing-sender-page";

export async function verifyBillingSenderRequest(request: Request): Promise<Response> {
  let token = "";
  try {
    token =
      request.method === "POST"
        ? String((await request.formData()).get("token") ?? "")
        : (new URL(request.url).searchParams.get("token") ?? "");
  } catch {
    return page("Invalid link", "This verification link is not valid.", 400);
  }
  if (token.length < 20 || token.length > 200)
    return page("Invalid link", "This verification link is not valid.", 400);
  const { guardPublicToken } = await import("@/lib/rate-limit.server");
  const guard = await guardPublicToken({ bucket: "billing_sender_verify", token });
  if (!guard.allowed) {
    const response = page(
      "Please try again later",
      "We cannot check this link right now. Please try again shortly.",
      429,
    );
    response.headers.set("Retry-After", String(Math.max(1, guard.retryAfterSeconds)));
    return response;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: agency, error: lookupError } = await supabaseAdmin
    .from("agencies")
    .select("id, name, billing_from_email, billing_from_token_expires_at")
    .eq("billing_from_token", token)
    .maybeSingle();
  if (lookupError) {
    console.error("[billing-sender] lookup", { code: lookupError.code });
    return page("Please try again", "We couldn't check this address. Please try again.", 503);
  }
  if (!agency)
    return page(
      "Link already used",
      "This address has already been verified or the link has been replaced.",
      400,
    );
  if (
    !agency.billing_from_token_expires_at ||
    new Date(agency.billing_from_token_expires_at).getTime() <= Date.now()
  )
    return page(
      "Link expired",
      "Verification links last 24 hours. Send yourself a new one from Settings → Quotes & Invoices.",
      400,
    );
  if (request.method === "GET")
    return page(
      "Confirm your billing address",
      `Confirm ${agency.billing_from_email} as the reply address for quotes and invoices sent by ${agency.name}.`,
      200,
      token,
    );
  const { data: changed, error } = await supabaseAdmin
    .from("agencies")
    .update({
      billing_from_verified_at: new Date().toISOString(),
      billing_from_token: null,
      billing_from_token_expires_at: null,
    })
    .eq("id", agency.id)
    .eq("billing_from_token", token)
    .gt("billing_from_token_expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error || !changed) {
    console.error("[billing-sender] redemption", { code: error?.code });
    return page(
      "Please try again",
      "We couldn't verify this address. The link may already have been used.",
      400,
    );
  }
  return page(
    "Address verified",
    `${agency.billing_from_email} is now the reply address on quotes and invoices sent by ${agency.name}. You can close this window.`,
  );
}

/**
 * Confirms an agency's billing "send from" address. The token is single-use and
 * time-limited; until it is confirmed the address is never used on outbound mail.
 */
export const Route = createFileRoute("/api/public/verify-billing-sender")({
  server: {
    handlers: {
      GET: ({ request }) => verifyBillingSenderRequest(request),
      POST: ({ request }) => verifyBillingSenderRequest(request),
    },
  },
});
