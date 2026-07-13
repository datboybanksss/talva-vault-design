import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
async function getCallerAgency(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id, role, suspended")
    .eq("user_id", userId)
    .eq("suspended", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: not an agency member");
  return { agencyId: data.agency_id as string, role: data.role as string };
}

// -----------------------------------------------------------------------------
// whoami — agency variant. Returns caller identity + agency context.
// -----------------------------------------------------------------------------
export const agencyWhoami = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, first_name, last_name, designation")
      .eq("id", userId)
      .maybeSingle();

    const { data: memberRow } = await supabase
      .from("agency_members")
      .select("agency_id, role, suspended")
      .eq("user_id", userId)
      .eq("suspended", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let agency: { id: string; name: string } | null = null;
    if (memberRow?.agency_id) {
      const { data: ag } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("id", memberRow.agency_id)
        .maybeSingle();
      if (ag) agency = { id: ag.id as string, name: ag.name as string };
    }

    return {
      userId: userId as string,
      email: (profile?.email as string) ?? (claims?.email as string) ?? "",
      displayName: (profile?.display_name as string) ?? "",
      firstName: (profile?.first_name as string) ?? "",
      lastName: (profile?.last_name as string) ?? "",
      avatarUrl: (profile?.avatar_url as string) ?? null,
      role: (memberRow?.role as string) ?? null,
      agency,
      isAgencyMember: !!memberRow,
    };
  });

// -----------------------------------------------------------------------------
// Notifications — empty for now; per-feature reminders will land as we build.
// -----------------------------------------------------------------------------
export const listAgencyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await getCallerAgency(supabase, userId); // ensures caller is an agency member
    return { computed: [] as any[], persisted: [] as any[] };
  });
