import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVITE_FLOWS, type InviteEmailConflict } from "@/lib/invite-email-check";

/** Inline duplicate check for the invitation forms (Save draft / leaving the email field). */
export const checkInviteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        flow: z.enum(INVITE_FLOWS),
        email: z.string().max(10000).trim().email(),
        exclude_id: z.string().uuid().nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<InviteEmailConflict | null> => {
    const { supabase, userId } = context as any;
    let agencyId: string | null = null;
    if (data.flow.startsWith("admin_")) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("You don't have permission to do that.");
    } else {
      const { data: aid } = await supabase.rpc("current_user_agency_id");
      if (!aid) throw new Error("You don't have permission to do that.");
      const { data: owner } = await supabase.rpc("has_agency_role", {
        _user_id: userId,
        _agency_id: aid,
        _role: "owner",
      });
      if (!owner) throw new Error("You don't have permission to do that.");
      agencyId = aid as string;
    }
    const { findInviteEmailConflict } = await import("@/lib/invite-email-check.server");
    return findInviteEmailConflict({
      flow: data.flow,
      email: data.email,
      agencyId,
      excludeId: data.exclude_id ?? null,
    });
  });
