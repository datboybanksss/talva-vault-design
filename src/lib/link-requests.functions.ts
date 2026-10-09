import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Talent side: connection requests from agencies, to accept or decline. */
export const listMyLinkRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: links, error } = await supabase
      .from("agency_talent_links")
      .select("id, agency_id, status, requested_at, request_expires_at")
      .eq("talent_user_id", userId)
      .eq("request_kind", "link_request")
      .eq("status", "invited")
      .order("requested_at", { ascending: false });
    if (error) throw new Error("We couldn't load your requests. Please try again.");
    const rows = (links ?? []) as any[];
    const open = rows.filter(
      (r) => !r.request_expires_at || new Date(r.request_expires_at).getTime() > Date.now(),
    );
    if (!open.length) return [];
    // Talent cannot read agencies directly; only names for their own requests.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ags } = await supabaseAdmin
      .from("agencies")
      .select("id, name")
      .in("id", Array.from(new Set(open.map((r) => r.agency_id))));
    const names = new Map((ags ?? []).map((a: any) => [a.id, a.name as string]));
    return open.map((r) => ({
      id: r.id as string,
      agencyName: names.get(r.agency_id) ?? "An agency",
      requestedAt: (r.requested_at as string) ?? null,
      expiresAt: (r.request_expires_at as string) ?? null,
    }));
  });

export const respondToLinkRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { emailLinkResponse } = await import("@/lib/link-notify.server");
    await emailLinkResponse(data.id, data.accept).catch(() => undefined);
    return { ok: true };
  });
