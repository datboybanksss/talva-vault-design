import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Returns the talent's profile + primary agency link (or null if the caller
 * is signed in but not a talent). Used by the /talent route gate and shell.
 */
export const getTalentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("talent_profiles")
      .select("id, user_id, agency_id, full_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return { profile: null, link: null, agency: null };

    const { data: link } = await supabase
      .from("agency_talent_links")
      .select("id, agency_id, status, display_name, talent_type, created_at, ended_at")
      .eq("talent_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let agency: { id: string; name: string } | null = null;
    if (link?.agency_id) {
      const { data: a } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("id", link.agency_id)
        .maybeSingle();
      if (a) agency = a;
    }
    return { profile, link, agency };
  });

const UpdateProfileInput = z.object({
  full_name: z.string().trim().min(1).max(160),
  talent_type: z.string().trim().max(80).nullable().optional(),
});

export const updateTalentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error: pErr } = await supabase
      .from("talent_profiles")
      .update({ full_name: data.full_name })
      .eq("user_id", userId);
    if (pErr) throw new Error(pErr.message);

    if (data.talent_type !== undefined) {
      await supabase
        .from("agency_talent_links")
        .update({
          display_name: data.full_name,
          talent_type: data.talent_type,
        })
        .eq("talent_user_id", userId);
    }
    return { ok: true };
  });
