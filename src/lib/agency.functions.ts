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

// -----------------------------------------------------------------------------
// Dashboard metrics — real counts scoped to caller's agency.
// -----------------------------------------------------------------------------
export const getAgencyDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const [talentRes, docsRes, talentInvRes, staffInvRes, billingRes] = await Promise.all([
      supabase.from("agency_talent_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("talent_shared_documents").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("talent_invitations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "pending"),
      supabase.from("agency_invitations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("kind", "staff").eq("status", "pending"),
      supabase.from("agency_billing_docs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    ]);

    return {
      talentCount: talentRes.count ?? 0,
      vaultDocumentsCount: docsRes.count ?? 0,
      invitationsCount: (talentInvRes.count ?? 0) + (staffInvRes.count ?? 0),
      invitationsNeedAction: (talentInvRes.count ?? 0) + (staffInvRes.count ?? 0),
      billingDocsCount: billingRes.count ?? 0,
    };
  });

// -----------------------------------------------------------------------------
// Talent links (with manager profile + shared doc count) scoped to agency.
// -----------------------------------------------------------------------------
export const listAgencyTalent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: links, error } = await supabase
      .from("agency_talent_links")
      .select("id, display_name, status, talent_type, manager_user_id, next_action, created_at, updated_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = links ?? [];
    const managerIds = Array.from(
      new Set(rows.map((r: any) => r.manager_user_id).filter(Boolean)),
    );
    const linkIds = rows.map((r: any) => r.id);

    const [managersRes, docsRes] = await Promise.all([
      managerIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, first_name, last_name, email")
            .in("id", managerIds)
        : Promise.resolve({ data: [] as any[] }),
      linkIds.length
        ? supabase
            .from("talent_shared_documents")
            .select("talent_link_id")
            .in("talent_link_id", linkIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const managerMap = new Map<string, string>();
    for (const p of (managersRes as any).data ?? []) {
      const label =
        (p.display_name as string) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ") ||
        (p.email as string) ||
        "Unassigned";
      managerMap.set(p.id as string, label);
    }

    const docCount = new Map<string, number>();
    for (const d of (docsRes as any).data ?? []) {
      const k = d.talent_link_id as string;
      docCount.set(k, (docCount.get(k) ?? 0) + 1);
    }

    return rows.map((r: any) => ({
      id: r.id as string,
      displayName: r.display_name as string,
      status: r.status as string,
      talentType: (r.talent_type as string) ?? null,
      managerUserId: (r.manager_user_id as string) ?? null,
      managerName: r.manager_user_id ? managerMap.get(r.manager_user_id) ?? "Unassigned" : "Unassigned",
      nextAction: (r.next_action as string) ?? null,
      docCount: docCount.get(r.id) ?? 0,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  });

