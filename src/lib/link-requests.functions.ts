import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTalentTermsAccepted } from "@/lib/terms-guard";
import { z } from "zod";

/** Talent side: connection requests from agencies, to accept or decline. */
export const listMyLinkRequests = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase.rpc("my_link_requests");
    if (error) throw new Error("We couldn't load your requests. Please try again.");
    return ((data ?? []) as any[]).map((r) => ({
      id: r.link_id as string,
      agencyName: (r.agency_name as string) ?? "An agency",
      requestedAt: (r.requested_at as string) ?? null,
      expiresAt: (r.expires_at as string) ?? null,
    }));
  });

export const respondToLinkRequest = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase.rpc("respond_link_request", {
      _link_id: data.id,
      _accept: data.accept,
    });
    if (error) {
      if (/REQUEST_EXPIRED/.test(error.message)) throw new Error("This request has expired.");
      if (/REQUEST_CLOSED/.test(error.message)) throw new Error("This request is no longer open.");
      throw new Error("We couldn't record your answer. Please try again.");
    }
    // Only an acceptance is ever reported to the agency; a decline stays
    // invisible so the agency cannot tell an existing account was involved.
    if (data.accept) {
      const { emailLinkResponse } = await import("@/lib/link-notify.server");
      await emailLinkResponse(data.id, true).catch(() => undefined);
    }
    return { ok: true };
  });
