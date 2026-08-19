import { createFileRoute } from "@tanstack/react-router";

function page(title: string, body: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · TalVault</title></head>
     <body style="margin:0;background:#f2f1ed;font-family:Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
       <div style="background:#fff;border-radius:12px;padding:32px;max-width:460px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.08);">
         <div style="font-size:34px;">${ok ? "✅" : "⚠️"}</div>
         <h1 style="font-size:20px;color:#1c2b2d;">${title}</h1>
         <p style="color:#6b7a7c;font-size:15px;line-height:1.6;">${body}</p>
       </div>
     </body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Confirms an agency's billing "send from" address. The token is single-use and
 * time-limited; until it is confirmed the address is never used on outbound mail.
 */
export const Route = createFileRoute("/api/public/verify-billing-sender")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!token || token.length < 20) return page("Invalid link", "This verification link is not valid.", false);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: agency } = await supabaseAdmin
          .from("agencies")
          .select("id, name, billing_from_email, billing_from_token_expires_at")
          .eq("billing_from_token", token)
          .maybeSingle();

        if (!agency) return page("Link already used", "This address has either been verified already or the link has been replaced by a newer one.", false);
        if (!agency.billing_from_token_expires_at || new Date(agency.billing_from_token_expires_at).getTime() < Date.now()) {
          return page("Link expired", "Verification links last 24 hours. Send yourself a new one from Settings → Quotes & Invoices.", false);
        }

        const { error } = await supabaseAdmin
          .from("agencies")
          .update({
            billing_from_verified_at: new Date().toISOString(),
            billing_from_token: null,
            billing_from_token_expires_at: null,
          })
          .eq("id", agency.id);
        if (error) return page("Something went wrong", "We could not verify this address. Please try again from Settings.", false);

        return page(
          "Address verified",
          `${agency.billing_from_email} is now used as the reply address on quotes and invoices sent by ${agency.name}. You can close this window.`,
          true,
        );
      },
    },
  },
});
