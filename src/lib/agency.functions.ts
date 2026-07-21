import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function extractRequestMeta(): { ip_address: string | null; user_agent: string | null } {
  try {
    const req = getRequest();
    const h = req?.headers;
    if (!h) return { ip_address: null, user_agent: null };
    const fwd = h.get("cf-connecting-ip")
      || h.get("x-real-ip")
      || (h.get("x-forwarded-for") ?? "").split(",")[0].trim()
      || null;
    return {
      ip_address: fwd || null,
      user_agent: h.get("user-agent") || null,
    };
  } catch {
    return { ip_address: null, user_agent: null };
  }
}

async function logAgencyAudit(
  supabase: any,
  agencyId: string,
  userId: string,
  email: string | undefined,
  action: string,
  targetType?: string,
  targetId?: string,
  targetLabel?: string,
  detail: Record<string, unknown> = {},
) {
  const { ip_address, user_agent } = extractRequestMeta();
  await supabase.from("agency_audit_log").insert({
    agency_id: agencyId,
    actor_id: userId,
    actor_email: email ?? null,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    target_label: targetLabel ?? null,
    detail,
    ip_address,
    user_agent,
  });
}


async function assertAgencyOwner(supabase: any, userId: string, agencyId: string) {
  const { data, error } = await supabase.rpc("has_agency_role", {
    _user_id: userId,
    _agency_id: agencyId,
    _role: "owner",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: only agency owners may perform this action.");
}

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

    const in30d = new Date(Date.now() + 30 * 86400000).toISOString();
    const nowIso = new Date().toISOString();
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const startOfMonthIso = startOfMonth.toISOString();
    const over48hIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const [
      talentRes, docsRes, talentInvRes, staffInvRes, billingRes,
      needsReviewRes, expiringRes, overdueRes,
      newThisMonthRes, activeRes, needsReviewOver48Res, expiringLinkIdsRes,
    ] = await Promise.all([
      supabase.from("agency_talent_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("talent_shared_documents").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("talent_invitations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "pending"),
      supabase.from("agency_invitations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("kind", "staff").eq("status", "pending"),
      supabase.from("agency_billing_docs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("agency_talent_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "needs_review"),
      supabase
        .from("talent_shared_documents")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", agencyId)
        .not("validity_expires_at", "is", null)
        .gte("validity_expires_at", nowIso)
        .lte("validity_expires_at", in30d),
      supabase.from("agency_billing_docs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "overdue"),
      supabase.from("agency_talent_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).gte("created_at", startOfMonthIso),
      supabase.from("agency_talent_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active"),
      supabase.from("agency_talent_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "needs_review").lte("updated_at", over48hIso),
      supabase
        .from("talent_shared_documents")
        .select("talent_link_id")
        .eq("agency_id", agencyId)
        .not("validity_expires_at", "is", null)
        .gte("validity_expires_at", nowIso)
        .lte("validity_expires_at", in30d),
    ]);

    const linksWithExpiring = new Set<string>();
    for (const d of (expiringLinkIdsRes as any).data ?? []) {
      if (d.talent_link_id) linksWithExpiring.add(d.talent_link_id as string);
    }
    const activeCount = activeRes.count ?? 0;
    const needsReviewCount = needsReviewRes.count ?? 0;
    // Fully compliant = active links with no expiring docs and not needing review
    const fullyCompliantCount = Math.max(0, activeCount - linksWithExpiring.size);

    return {
      talentCount: talentRes.count ?? 0,
      vaultDocumentsCount: docsRes.count ?? 0,
      invitationsCount: (talentInvRes.count ?? 0) + (staffInvRes.count ?? 0),
      invitationsNeedAction: (talentInvRes.count ?? 0) + (staffInvRes.count ?? 0),
      billingDocsCount: billingRes.count ?? 0,
      needsReviewCount,
      needsReviewOver48Count: needsReviewOver48Res.count ?? 0,
      expiringSoonCount: expiringRes.count ?? 0,
      overdueInvoicesCount: overdueRes.count ?? 0,
      newTalentThisMonth: newThisMonthRes.count ?? 0,
      fullyCompliantCount,
      activeTalentCount: activeCount,
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

    const in30dIso = new Date(Date.now() + 30 * 86400000).toISOString();
    const nowIso = new Date().toISOString();
    const [managersRes, docsRes, expiringRes, lastDocRes] = await Promise.all([
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
      linkIds.length
        ? supabase
            .from("talent_shared_documents")
            .select("talent_link_id")
            .in("talent_link_id", linkIds)
            .not("validity_expires_at", "is", null)
            .gte("validity_expires_at", nowIso)
            .lte("validity_expires_at", in30dIso)
        : Promise.resolve({ data: [] as any[] }),
      linkIds.length
        ? supabase
            .from("talent_shared_documents")
            .select("talent_link_id, created_at")
            .in("talent_link_id", linkIds)
            .order("created_at", { ascending: false })
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
    const expiringCount = new Map<string, number>();
    for (const d of (expiringRes as any).data ?? []) {
      const k = d.talent_link_id as string;
      expiringCount.set(k, (expiringCount.get(k) ?? 0) + 1);
    }
    const lastDocAt = new Map<string, string>();
    for (const d of (lastDocRes as any).data ?? []) {
      const k = d.talent_link_id as string;
      if (!lastDocAt.has(k)) lastDocAt.set(k, d.created_at as string);
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
      expiringDocsCount: expiringCount.get(r.id) ?? 0,
      lastDocumentAt: lastDocAt.get(r.id) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  });


// -----------------------------------------------------------------------------
// Invitations — talent + staff, scoped to caller's agency
// -----------------------------------------------------------------------------
type InviteRow = {
  id: string;
  type: "talent" | "staff";
  recipient_name: string | null;
  email: string;
  status: string;
  token: string;
  invited_by: string | null;
  invited_by_label: string;
  last_sent_at: string;
  expires_at: string;
  send_count: number;
  created_at: string;
  role: string | null;
};

export const listAgencyInvitationsMine = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const [talentRes, staffRes] = await Promise.all([
      supabase
        .from("talent_invitations")
        .select("id, talent_name, email, status, token, invited_by, last_sent_at, expires_at, send_count, created_at")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("agency_invitations")
        .select("id, contact_person, email, status, token, invited_by, last_sent_at, expires_at, send_count, created_at, role")
        .eq("agency_id", agencyId)
        .eq("kind", "staff")
        .order("created_at", { ascending: false }),
    ]);
    if (talentRes.error) throw new Error(talentRes.error.message);
    if (staffRes.error) throw new Error(staffRes.error.message);

    const inviterIds = Array.from(
      new Set([
        ...(talentRes.data ?? []).map((r: any) => r.invited_by).filter(Boolean),
        ...(staffRes.data ?? []).map((r: any) => r.invited_by).filter(Boolean),
      ]),
    );
    let inviterMap = new Map<string, string>();
    if (inviterIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", inviterIds);
      for (const p of profiles ?? []) {
        inviterMap.set(
          p.id as string,
          (p.display_name as string) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ") ||
            (p.email as string) ||
            "Team member",
        );
      }
    }
    const labelFor = (id: string | null) =>
      !id ? "—" : id === userId ? "You" : inviterMap.get(id) ?? "Team member";

    const talent: InviteRow[] = (talentRes.data ?? []).map((r: any) => ({
      id: r.id, type: "talent", recipient_name: r.talent_name ?? null,
      email: r.email, status: r.status, token: r.token,
      invited_by: r.invited_by, invited_by_label: labelFor(r.invited_by),
      last_sent_at: r.last_sent_at, expires_at: r.expires_at,
      send_count: r.send_count, created_at: r.created_at, role: null,
    }));
    const staff: InviteRow[] = (staffRes.data ?? []).map((r: any) => ({
      id: r.id, type: "staff", recipient_name: r.contact_person ?? null,
      email: r.email, status: r.status, token: r.token,
      invited_by: r.invited_by, invited_by_label: labelFor(r.invited_by),
      last_sent_at: r.last_sent_at, expires_at: r.expires_at,
      send_count: r.send_count, created_at: r.created_at, role: r.role ?? "staff",
    }));

    const rows = [...talent, ...staff].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return rows;
  });

const folderSelectionItem = z.object({
  name: z.string().min(1).max(120),
  sort_order: z.number().int().min(0).optional(),
  retention_years: z.number().int().min(0).max(100).nullable().optional(),
});

export const createTalentInvitationMine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      talent_name: z.string().min(1),
      email: z.string().email(),
      expiry_days: z.number().int().min(1).max(60).default(14),
      folder_mode: z.enum(["standard", "custom"]).default("standard"),
      folder_selection: z.array(folderSelectionItem).default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);
    const expires_at = new Date(Date.now() + data.expiry_days * 86400000).toISOString();

    // Normalize sort_order across the selection
    const selection = data.folder_selection.map((f, i) => ({
      name: f.name,
      sort_order: f.sort_order ?? i,
      retention_years: f.retention_years ?? null,
    }));

    const { data: inv, error } = await supabase
      .from("talent_invitations")
      .insert({
        agency_id: agencyId,
        talent_name: data.talent_name,
        email: data.email,
        expires_at,
        invited_by: userId,
        folder_mode: data.folder_mode,
        folder_selection: selection,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "create_talent_invitation", "talent_invitation", inv.id, data.talent_name,
      {
        email: data.email,
        expires_at,
        folder_mode: data.folder_mode,
        folder_count: selection.length,
      });
    return inv;
  });


export const createStaffInvitationMine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contact_person: z.string().optional(),
      email: z.string().email(),
      role: z.string().default("staff"),
      expiry_days: z.number().int().min(1).max(60).default(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    // Fetch agency name (needed for NOT NULL agency_name column)
    const { data: ag } = await supabase
      .from("agencies").select("name").eq("id", agencyId).single();
    if (!ag) throw new Error("Agency not found");

    const expires_at = new Date(Date.now() + data.expiry_days * 86400000).toISOString();
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .insert({
        agency_id: agencyId,
        agency_name: ag.name,
        contact_person: data.contact_person ?? null,
        email: data.email,
        kind: "staff",
        role: data.role,
        expires_at,
        invited_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "create_staff_invitation", "agency_invitation", inv.id,
      data.contact_person ?? data.email,
      { email: data.email, role: data.role, expires_at });
    return inv;
  });

export const resendAgencyInvitationMine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string(),
      type: z.enum(["talent", "staff"]),
      extend_days: z.number().int().min(1).max(60).default(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);
    const table = data.type === "talent" ? "talent_invitations" : "agency_invitations";
    const expires_at = new Date(Date.now() + data.extend_days * 86400000).toISOString();

    const { data: cur } = await supabase.from(table).select("send_count, email").eq("id", data.id).single();
    const { data: inv, error } = await supabase
      .from(table)
      .update({
        last_sent_at: new Date().toISOString(),
        send_count: (cur?.send_count ?? 0) + 1,
        expires_at,
        status: "pending",
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      `resend_${data.type}_invitation`, `${data.type}_invitation`, data.id, cur?.email,
      { new_expires_at: expires_at });
    return inv;
  });

export const revokeAgencyInvitationMine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), type: z.enum(["talent", "staff"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);
    const table = data.type === "talent" ? "talent_invitations" : "agency_invitations";
    const { data: inv, error } = await supabase
      .from(table).update({ status: "revoked" }).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      `revoke_${data.type}_invitation`, `${data.type}_invitation`, data.id, inv?.email);
    return inv;
  });

export const logAgencyCopyLinkMine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), type: z.enum(["talent", "staff"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      `copy_${data.type}_invitation_link`, `${data.type}_invitation`, data.id);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Document Vault — talent_shared_documents + storage bucket "talent-documents"
// Path convention: <agency_id>/<talent_link_id_or_"unassigned">/<uuid>-<filename>
// -----------------------------------------------------------------------------

export const listAgencyVaultDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: docs, error } = await supabase
      .from("talent_shared_documents")
      .select("id, name, folder, status, validity_expires_at, storage_path, talent_link_id, uploaded_by, created_at, updated_at, locked_until, current_version_id")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = docs ?? [];
    const linkIds = Array.from(new Set(rows.map((r: any) => r.talent_link_id).filter(Boolean)));
    const talentMap = new Map<string, string>();
    if (linkIds.length) {
      const { data: links } = await supabase
        .from("agency_talent_links")
        .select("id, display_name")
        .in("id", linkIds);
      for (const l of links ?? []) talentMap.set(l.id as string, l.display_name as string);
    }

    return rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      folder: r.folder as string,
      status: r.status as string,
      validityExpiresAt: (r.validity_expires_at as string) ?? null,
      storagePath: (r.storage_path as string) ?? null,
      talentLinkId: (r.talent_link_id as string) ?? null,
      talentName: r.talent_link_id ? (talentMap.get(r.talent_link_id) ?? "Unassigned") : "Unassigned",
      uploadedBy: (r.uploaded_by as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      lockedUntil: (r.locked_until as string) ?? null,
      currentVersionId: (r.current_version_id as string) ?? null,
    }));
  });

export const listAgencyTalentLinksLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data, error } = await supabase
      .from("agency_talent_links")
      .select("id, display_name, status")
      .eq("agency_id", agencyId)
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      displayName: r.display_name as string,
      status: r.status as string,
    }));
  });

// List folders provisioned for a specific talent link (from M2 invite selection).
export const listAgencyTalentFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ talent_link_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: rows, error } = await supabase
      .from("agency_talent_folders")
      .select("id, folder_name, sort_order")
      .eq("agency_id", agencyId)
      .eq("talent_link_id", data.talent_link_id)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      folderName: r.folder_name as string,
      sortOrder: r.sort_order as number,
    }));
  });



// End / reactivate a talent relationship. Owner-only.
export const endTalentRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    const { data: link, error: fetchErr } = await supabase
      .from("agency_talent_links")
      .select("id, display_name, agency_id, status")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (link.agency_id !== agencyId) throw new Error("Forbidden");

    const { data: updated, error } = await supabase
      .from("agency_talent_links")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        ended_by: userId,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "end_talent_relationship", "agency_talent_link", data.id, link.display_name,
      { previous_status: link.status });
    return updated;
  });

export const reactivateTalentRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    const { data: link, error: fetchErr } = await supabase
      .from("agency_talent_links")
      .select("id, display_name, agency_id, status")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (link.agency_id !== agencyId) throw new Error("Forbidden");

    const { data: updated, error } = await supabase
      .from("agency_talent_links")
      .update({
        status: "active",
        ended_at: null,
        ended_by: null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "reactivate_talent_relationship", "agency_talent_link", data.id, link.display_name);
    return updated;
  });

export const registerAgencyVaultDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1),
      folder: z.string().min(1),
      storage_path: z.string().min(1),
      talent_link_id: z.string().uuid().nullable().optional(),
      status: z.enum(["ai_suggested", "filed", "needs_review"]).default("needs_review"),
      validity_expires_at: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    // Storage path must live under this agency's folder (defense in depth; storage RLS also enforces).
    if (!data.storage_path.startsWith(`${agencyId}/`)) {
      throw new Error("Invalid storage path for this agency.");
    }

    // Block new uploads (or new versions via new doc) when the talent relationship has ended.
    if (data.talent_link_id) {
      const { data: link, error: linkErr } = await supabase
        .from("agency_talent_links")
        .select("status, agency_id")
        .eq("id", data.talent_link_id)
        .maybeSingle();
      if (linkErr) throw new Error(linkErr.message);
      if (!link || link.agency_id !== agencyId) throw new Error("Invalid talent for this agency.");
      if (link.status === "ended") {
        throw new Error("RELATIONSHIP_ENDED: this talent relationship has ended — new uploads are blocked. Reactivate the relationship to share new documents.");
      }
    }


    const { data: inserted, error } = await supabase
      .from("talent_shared_documents")
      .insert({
        agency_id: agencyId,
        talent_link_id: data.talent_link_id ?? null,
        name: data.name,
        folder: data.folder,
        status: data.status,
        validity_expires_at: data.validity_expires_at ?? null,
        storage_path: data.storage_path,
        uploaded_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "upload_vault_document", "talent_shared_document", inserted.id, data.name,
      { folder: data.folder, talent_link_id: data.talent_link_id ?? null });
    return inserted;
  });

export const getAgencyVaultSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      disposition: z.enum(["inline", "attachment"]).default("attachment"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: row, error } = await supabase
      .from("talent_shared_documents")
      .select("storage_path, agency_id, name")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.agency_id !== agencyId) throw new Error("Forbidden");
    if (!row.storage_path) throw new Error("No file attached to this document.");

    const options = data.disposition === "attachment" ? { download: row.name as string } : undefined;
    const { data: signed, error: sErr } = await supabase
      .storage.from("talent-documents")
      .createSignedUrl(row.storage_path, 60 * 30, options);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl as string, name: row.name as string };
  });

export const deleteAgencyVaultDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: row, error } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, name, storage_path, folder, locked_until")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.agency_id !== agencyId) throw new Error("Forbidden");

    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      throw new Error(
        `RETENTION_LOCKED: this document is locked until ${new Date(row.locked_until).toLocaleDateString()} by an active retention rule.`,
      );
    }

    const { data: versions } = await supabase
      .from("talent_shared_document_versions")
      .select("storage_path")
      .eq("document_id", row.id);
    const paths = Array.from(
      new Set(
        [row.storage_path as string | null, ...(versions ?? []).map((v: any) => v.storage_path)]
          .filter(Boolean) as string[],
      ),
    );
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from("talent-documents").remove(paths);
      if (rmErr) throw new Error(rmErr.message);
    }
    const { error: dErr } = await supabase
      .from("talent_shared_documents").delete().eq("id", row.id);
    if (dErr) throw new Error(dErr.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "delete_vault_document", "talent_shared_document", row.id, row.name,
      { folder: row.folder, storage_path: row.storage_path });
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Retention rules
// -----------------------------------------------------------------------------
export const listAgencyRetentionRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data, error } = await supabase
      .from("agency_retention_rules")
      .select("id, scope, scope_value, document_id, retention_years, description, created_at, updated_at")
      .eq("agency_id", agencyId)
      .order("scope", { ascending: true })
      .order("scope_value", { ascending: true });
    if (error) throw new Error(error.message);

    const docIds = (data ?? []).map((r: any) => r.document_id).filter(Boolean);
    const docMap = new Map<string, { name: string; folder: string }>();
    if (docIds.length) {
      const { data: docs } = await supabase
        .from("talent_shared_documents")
        .select("id, name, folder")
        .in("id", docIds);
      for (const d of docs ?? []) docMap.set(d.id, { name: d.name, folder: d.folder });
    }

    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      scope: r.scope as "folder" | "document",
      scopeValue: (r.scope_value as string) ?? null,
      documentId: (r.document_id as string) ?? null,
      retentionYears: r.retention_years as number,
      description: (r.description as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      documentLabel: r.document_id ? docMap.get(r.document_id)?.name ?? "—" : null,
      documentFolder: r.document_id ? docMap.get(r.document_id)?.folder ?? null : null,
    }));
  });

export const upsertAgencyRetentionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      scope: z.enum(["folder", "document"]),
      scope_value: z.string().min(1).nullable().optional(),
      document_id: z.string().uuid().nullable().optional(),
      retention_years: z.number().int().min(0).max(100),
      description: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    const payload: Record<string, unknown> = {
      agency_id: agencyId,
      scope: data.scope,
      scope_value: data.scope === "folder" ? data.scope_value ?? null : null,
      document_id: data.scope === "document" ? data.document_id ?? null : null,
      retention_years: data.retention_years,
      description: data.description ?? null,
      created_by: userId,
    };

    let row: any;
    if (data.id) {
      const { data: r, error } = await supabase
        .from("agency_retention_rules").update(payload)
        .eq("id", data.id).eq("agency_id", agencyId).select().single();
      if (error) throw new Error(error.message);
      row = r;
    } else {
      const { data: r, error } = await supabase
        .from("agency_retention_rules").insert(payload).select().single();
      if (error) throw new Error(error.message);
      row = r;
    }

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      data.id ? "update_retention_rule" : "create_retention_rule",
      "agency_retention_rule", row.id,
      data.scope === "folder" ? data.scope_value ?? "" : data.document_id ?? "",
      { scope: data.scope, retention_years: data.retention_years });
    return row;
  });

export const deleteAgencyRetentionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);
    const { data: row, error } = await supabase
      .from("agency_retention_rules").delete()
      .eq("id", data.id).eq("agency_id", agencyId).select().single();
    if (error) throw new Error(error.message);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "delete_retention_rule", "agency_retention_rule", row.id, row.scope_value ?? row.document_id);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Versioning
// -----------------------------------------------------------------------------
export const listAgencyDocumentVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ document_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: doc, error: dErr } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, name, storage_path, current_version_id")
      .eq("id", data.document_id).single();
    if (dErr) throw new Error(dErr.message);
    if (doc.agency_id !== agencyId) throw new Error("Forbidden");

    const { data: versions, error } = await supabase
      .from("talent_shared_document_versions")
      .select("id, version_number, name, storage_path, size_bytes, mime_type, uploaded_by, created_at")
      .eq("document_id", data.document_id)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      currentVersionId: (doc.current_version_id as string) ?? null,
      currentStoragePath: (doc.storage_path as string) ?? null,
      versions: versions ?? [],
    };
  });

export const registerAgencyDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      document_id: z.string().uuid(),
      storage_path: z.string().min(1),
      name: z.string().min(1),
      size_bytes: z.number().int().nullable().optional(),
      mime_type: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    if (!data.storage_path.startsWith(`${agencyId}/`)) {
      throw new Error("Invalid storage path for this agency.");
    }

    const { data: doc, error: dErr } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, storage_path, name, talent_link_id")
      .eq("id", data.document_id).single();
    if (dErr) throw new Error(dErr.message);
    if (doc.agency_id !== agencyId) throw new Error("Forbidden");

    if (doc.talent_link_id) {
      const { data: link } = await supabase
        .from("agency_talent_links")
        .select("status")
        .eq("id", doc.talent_link_id)
        .maybeSingle();
      if (link?.status === "ended") {
        throw new Error("RELATIONSHIP_ENDED: this talent relationship has ended — new versions are blocked. Reactivate the relationship to share new documents.");
      }
    }

    const { data: last } = await supabase
      .from("talent_shared_document_versions")
      .select("version_number")
      .eq("document_id", data.document_id)
      .order("version_number", { ascending: false })
      .limit(1).maybeSingle();

    let nextNumber = ((last?.version_number as number | undefined) ?? 0) + 1;
    if (!last && doc.storage_path && doc.storage_path !== data.storage_path) {
      await supabase.from("talent_shared_document_versions").insert({
        document_id: data.document_id,
        version_number: 1,
        storage_path: doc.storage_path,
        name: doc.name,
        uploaded_by: userId,
      });
      nextNumber = 2;
    }

    const { data: version, error } = await supabase
      .from("talent_shared_document_versions")
      .insert({
        document_id: data.document_id,
        version_number: nextNumber,
        storage_path: data.storage_path,
        name: data.name,
        size_bytes: data.size_bytes ?? null,
        mime_type: data.mime_type ?? null,
        uploaded_by: userId,
      })
      .select().single();
    if (error) throw new Error(error.message);

    await supabase
      .from("talent_shared_documents")
      .update({
        current_version_id: version.id,
        storage_path: data.storage_path,
        name: data.name,
      })
      .eq("id", data.document_id);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "upload_document_version", "talent_shared_document", data.document_id, data.name,
      { version_number: nextNumber });
    return version;
  });

export const getAgencyVersionSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      version_id: z.string().uuid(),
      disposition: z.enum(["inline", "attachment"]).default("inline"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: v, error } = await supabase
      .from("talent_shared_document_versions")
      .select("storage_path, name, document_id, talent_shared_documents!inner(agency_id)")
      .eq("id", data.version_id).single();
    if (error) throw new Error(error.message);
    if ((v as any).talent_shared_documents.agency_id !== agencyId) throw new Error("Forbidden");

    const options = data.disposition === "attachment" ? { download: v.name as string } : undefined;
    const { data: signed, error: sErr } = await supabase.storage
      .from("talent-documents")
      .createSignedUrl(v.storage_path as string, 60 * 30, options);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl as string, name: v.name as string };
  });

// -----------------------------------------------------------------------------
// Folder Templates — owner writes, member reads
// -----------------------------------------------------------------------------

const templateItemSchema = z.object({
  id: z.string().uuid().optional(),
  folder_name: z.string().min(1).max(120),
  sort_order: z.number().int().min(0).default(0),
  default_retention_years: z.number().int().min(0).max(100).nullable().optional(),
});

export const listAgencyFolderTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId, role } = await getCallerAgency(supabase, userId);

    const { data: templates, error } = await supabase
      .from("agency_folder_templates")
      .select("id, name, description, is_default, created_at, updated_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (templates ?? []).map((t: any) => t.id);
    let items: any[] = [];
    if (ids.length) {
      const { data: itemRows, error: iErr } = await supabase
        .from("agency_folder_template_items")
        .select("id, template_id, folder_name, sort_order, default_retention_years")
        .in("template_id", ids)
        .order("sort_order", { ascending: true });
      if (iErr) throw new Error(iErr.message);
      items = itemRows ?? [];
    }
    return { role, templates: templates ?? [], items };
  });

export const upsertAgencyFolderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(120),
      description: z.string().max(500).nullable().optional(),
      is_default: z.boolean().optional(),
      items: z.array(templateItemSchema).default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    let templateId = data.id;
    if (templateId) {
      const { error } = await supabase
        .from("agency_folder_templates")
        .update({
          name: data.name,
          description: data.description ?? null,
          is_default: data.is_default ?? false,
        })
        .eq("id", templateId)
        .eq("agency_id", agencyId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await supabase
        .from("agency_folder_templates")
        .insert({
          agency_id: agencyId,
          name: data.name,
          description: data.description ?? null,
          is_default: data.is_default ?? false,
        })
        .select("id").single();
      if (error) throw new Error(error.message);
      templateId = row.id;
    }

    // Replace items
    await supabase.from("agency_folder_template_items").delete().eq("template_id", templateId);
    if (data.items.length) {
      const rows = data.items.map((it, idx) => ({
        template_id: templateId,
        folder_name: it.folder_name,
        sort_order: it.sort_order ?? idx,
        default_retention_years: it.default_retention_years ?? null,
        required_docs: [],
      }));
      const { error } = await supabase.from("agency_folder_template_items").insert(rows);
      if (error) throw new Error(error.message);
    }

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      data.id ? "update_folder_template" : "create_folder_template",
      "agency_folder_template", templateId, data.name,
      { item_count: data.items.length });

    return { id: templateId };
  });

export const deleteAgencyFolderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    const { data: row, error } = await supabase
      .from("agency_folder_templates")
      .delete()
      .eq("id", data.id).eq("agency_id", agencyId)
      .select("id, name").single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "delete_folder_template", "agency_folder_template", row.id, row.name);
    return { ok: true };
  });

export const applyAgencyFolderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ template_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);

    const { data: tmpl, error: tErr } = await supabase
      .from("agency_folder_templates")
      .select("id, name, agency_id")
      .eq("id", data.template_id).single();
    if (tErr) throw new Error(tErr.message);
    if (tmpl.agency_id !== agencyId) throw new Error("Forbidden");

    const { data: items, error: iErr } = await supabase
      .from("agency_folder_template_items")
      .select("folder_name, default_retention_years")
      .eq("template_id", data.template_id);
    if (iErr) throw new Error(iErr.message);

    let created = 0;
    for (const it of items ?? []) {
      if (!it.default_retention_years || it.default_retention_years <= 0) continue;
      const { data: existing } = await supabase
        .from("agency_retention_rules")
        .select("id")
        .eq("agency_id", agencyId)
        .eq("scope", "folder")
        .eq("scope_value", it.folder_name)
        .maybeSingle();
      if (existing) {
        await supabase.from("agency_retention_rules")
          .update({ retention_years: it.default_retention_years })
          .eq("id", existing.id);
      } else {
        await supabase.from("agency_retention_rules").insert({
          agency_id: agencyId,
          scope: "folder",
          scope_value: it.folder_name,
          retention_years: it.default_retention_years,
          description: `Applied from template: ${tmpl.name}`,
          created_by: userId,
        });
        created += 1;
      }
    }

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "apply_folder_template", "agency_folder_template", tmpl.id, tmpl.name,
      { rules_created: created });

    return { ok: true, rules_created: created };
  });

// -----------------------------------------------------------------------------
// Quotes & Invoices — agency-side CRUD
// -----------------------------------------------------------------------------

const billingKind = z.enum(["quote", "invoice"]);
const billingStatus = z.enum(["draft", "sent", "accepted", "paid", "overdue", "cancelled"]);

export const listAgencyBillingDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data, error } = await supabase
      .from("agency_billing_docs")
      .select("id, kind, number, client_name, talent_name, issued_at, due_date, currency, total_cents, status, notes, shared_with_talent, converted_from_quote_id, created_at, updated_at")
      .eq("agency_id", agencyId)
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAgencyBillingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      kind: billingKind,
      number: z.string().min(1).max(64),
      client_name: z.string().max(200).nullable().optional(),
      talent_name: z.string().max(200).nullable().optional(),
      issued_at: z.string().min(10),
      due_date: z.string().min(10).nullable().optional(),
      currency: z.string().min(3).max(3).default("ZAR"),
      total_cents: z.number().int().min(0),
      status: billingStatus.default("draft"),
      notes: z.string().max(2000).nullable().optional(),
      shared_with_talent: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const payload: any = {
      agency_id: agencyId,
      kind: data.kind,
      number: data.number,
      client_name: data.client_name ?? null,
      talent_name: data.talent_name ?? null,
      issued_at: data.issued_at,
      due_date: data.due_date ?? null,
      currency: data.currency,
      total_cents: data.total_cents,
      status: data.status,
      notes: data.notes ?? null,
      shared_with_talent: data.shared_with_talent ?? false,
    };

    let row;
    if (data.id) {
      const { data: r, error } = await supabase
        .from("agency_billing_docs")
        .update(payload)
        .eq("id", data.id).eq("agency_id", agencyId)
        .select().single();
      if (error) throw new Error(error.message);
      row = r;
    } else {
      const { data: r, error } = await supabase
        .from("agency_billing_docs")
        .insert(payload)
        .select().single();
      if (error) throw new Error(error.message);
      row = r;
    }

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      data.id ? "update_billing_doc" : "create_billing_doc",
      "agency_billing_doc", row.id, `${row.kind.toUpperCase()} ${row.number}`,
      { status: row.status, total_cents: row.total_cents });

    return row;
  });

export const updateAgencyBillingDocStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: billingStatus }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: row, error } = await supabase
      .from("agency_billing_docs")
      .update({ status: data.status })
      .eq("id", data.id).eq("agency_id", agencyId)
      .select().single();
    if (error) throw new Error(error.message);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "update_billing_doc_status", "agency_billing_doc", row.id,
      `${row.kind.toUpperCase()} ${row.number}`, { new_status: data.status });
    return row;
  });

export const deleteAgencyBillingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: row, error } = await supabase
      .from("agency_billing_docs")
      .delete()
      .eq("id", data.id).eq("agency_id", agencyId)
      .select("id, kind, number").single();
    if (error) throw new Error(error.message);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "delete_billing_doc", "agency_billing_doc", row.id,
      `${row.kind.toUpperCase()} ${row.number}`);
    return { ok: true };
  });

export const setBillingDocShared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), shared: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: row, error } = await supabase
      .from("agency_billing_docs")
      .update({ shared_with_talent: data.shared })
      .eq("id", data.id).eq("agency_id", agencyId)
      .select().single();
    if (error) throw new Error(error.message);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      data.shared ? "share_billing_doc" : "unshare_billing_doc",
      "agency_billing_doc", row.id, `${row.kind.toUpperCase()} ${row.number}`);
    return row;
  });

export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      quote_id: z.string().uuid(),
      invoice_number: z.string().min(1).max(64),
      issued_at: z.string().min(10).optional(),
      due_date: z.string().min(10).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: quote, error: qErr } = await supabase
      .from("agency_billing_docs")
      .select("*")
      .eq("id", data.quote_id).eq("agency_id", agencyId).eq("kind", "quote")
      .single();
    if (qErr) throw new Error(qErr.message);
    if (!quote) throw new Error("Quote not found");

    // Guard: prevent re-conversion
    const { data: existing } = await supabase
      .from("agency_billing_docs")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("converted_from_quote_id", data.quote_id)
      .maybeSingle();
    if (existing) throw new Error("This quote has already been converted to an invoice");

    const today = new Date().toISOString().slice(0, 10);
    const { data: invoice, error: iErr } = await supabase
      .from("agency_billing_docs")
      .insert({
        agency_id: agencyId,
        kind: "invoice",
        number: data.invoice_number,
        client_name: quote.client_name,
        talent_name: quote.talent_name,
        issued_at: data.issued_at ?? today,
        due_date: data.due_date ?? null,
        currency: quote.currency,
        total_cents: quote.total_cents,
        status: "draft",
        notes: quote.notes,
        shared_with_talent: quote.shared_with_talent,
        converted_from_quote_id: quote.id,
      })
      .select().single();
    if (iErr) throw new Error(iErr.message);

    // Mark quote as accepted (conversion implies acceptance)
    await supabase
      .from("agency_billing_docs")
      .update({ status: "accepted" })
      .eq("id", quote.id).eq("agency_id", agencyId);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "convert_quote_to_invoice", "agency_billing_doc", invoice.id,
      `${quote.number} → ${invoice.number}`,
      { quote_id: quote.id, invoice_id: invoice.id });

    return invoice;
  });

// -----------------------------------------------------------------------------
// Activity log (M7) — filterable audit trail for the caller's agency.
// -----------------------------------------------------------------------------
export const listAgencyAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      action: z.string().optional(),
      target_type: z.string().optional(),
      actor_id: z.string().optional(),
      since: z.string().optional(),
      limit: z.number().int().min(1).max(1000).default(500),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    let q = supabase
      .from("agency_audit_log")
      .select("id, actor_id, actor_email, action, target_type, target_id, target_label, detail, ip_address, user_agent, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.target_type) q = q.eq("target_type", data.target_type);
    if (data.actor_id) q = q.eq("actor_id", data.actor_id);
    if (data.since) q = q.gte("created_at", data.since);


    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean)));
    let actorMap = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", actorIds);
      for (const p of profiles ?? []) {
        actorMap.set(
          p.id as string,
          (p.display_name as string) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ") ||
            (p.email as string) ||
            "Team member",
        );
      }
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      actorId: (r.actor_id as string) ?? null,
      actorName: r.actor_id ? actorMap.get(r.actor_id) ?? (r.actor_email as string) ?? "Team member" : "System",
      actorEmail: (r.actor_email as string) ?? null,
      action: r.action as string,
      targetType: (r.target_type as string) ?? null,
      targetId: (r.target_id as string) ?? null,
      targetLabel: (r.target_label as string) ?? null,
      detail: r.detail ?? {},
      ipAddress: (r.ip_address as string) ?? null,
      userAgent: (r.user_agent as string) ?? null,
      createdAt: r.created_at as string,
    }));
  });

export const listAgencyAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data, error } = await supabase
      .from("agency_audit_log")
      .select("action")
      .eq("agency_id", agencyId)
      .limit(1000);
    if (error) throw new Error(error.message);
    const actions = Array.from(new Set((data ?? []).map((r: any) => r.action as string))) as string[];
    return actions.sort();
  });


// -----------------------------------------------------------------------------
// M6 — Contract detail (contracts live in talent_shared_documents, folder='Contracts')
// -----------------------------------------------------------------------------

export const getAgencyContract = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: doc, error } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, name, folder, status, storage_path, talent_link_id, validity_expires_at, contract_client_name, contract_start_date, contract_end_date, contract_total_cents, contract_currency, contract_notes, created_at, updated_at")
      .eq("id", data.id).eq("agency_id", agencyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Contract not found");

    let talentName = "Unassigned";
    if (doc.talent_link_id) {
      const { data: link } = await supabase
        .from("agency_talent_links").select("display_name").eq("id", doc.talent_link_id).maybeSingle();
      if (link) talentName = link.display_name as string;
    }

    const { data: invoices } = await supabase
      .from("agency_billing_docs")
      .select("id, kind, number, issued_at, due_date, currency, total_cents, status, shared_with_talent")
      .eq("agency_id", agencyId)
      .eq("contract_document_id", data.id)
      .order("issued_at", { ascending: false });

    return {
      id: doc.id as string,
      name: doc.name as string,
      folder: doc.folder as string,
      status: doc.status as string,
      storagePath: (doc.storage_path as string) ?? null,
      talentLinkId: (doc.talent_link_id as string) ?? null,
      talentName,
      validityExpiresAt: (doc.validity_expires_at as string) ?? null,
      clientName: (doc.contract_client_name as string) ?? null,
      startDate: (doc.contract_start_date as string) ?? null,
      endDate: (doc.contract_end_date as string) ?? null,
      totalCents: (doc.contract_total_cents as number) ?? null,
      currency: (doc.contract_currency as string) ?? null,
      notes: (doc.contract_notes as string) ?? null,
      createdAt: doc.created_at as string,
      updatedAt: doc.updated_at as string,
      invoices: (invoices ?? []).map((r: any) => ({
        id: r.id, kind: r.kind, number: r.number,
        issuedAt: r.issued_at, dueDate: r.due_date,
        currency: r.currency, totalCents: r.total_cents,
        status: r.status, sharedWithTalent: r.shared_with_talent,
      })),
    };
  });

export const updateAgencyContractMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    contract_client_name: z.string().max(200).nullable().optional(),
    contract_start_date: z.string().nullable().optional(),
    contract_end_date: z.string().nullable().optional(),
    contract_total_cents: z.number().int().min(0).nullable().optional(),
    contract_currency: z.string().min(3).max(3).nullable().optional(),
    contract_notes: z.string().max(4000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { id, ...rest } = data;
    const { data: row, error } = await supabase
      .from("talent_shared_documents")
      .update(rest)
      .eq("id", id).eq("agency_id", agencyId)
      .select("id, name").single();
    if (error) throw new Error(error.message);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "update_contract_meta", "talent_shared_document", row.id, row.name);
    return row;
  });

export const createInvoiceForContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contract_id: z.string().uuid(),
    number: z.string().min(1).max(64),
    total_cents: z.number().int().min(0),
    issued_at: z.string().min(10).optional(),
    due_date: z.string().min(10).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    const { data: contract, error: cErr } = await supabase
      .from("talent_shared_documents")
      .select("id, name, talent_link_id, contract_client_name, contract_currency")
      .eq("id", data.contract_id).eq("agency_id", agencyId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contract) throw new Error("Contract not found");

    let talentName: string | null = null;
    if (contract.talent_link_id) {
      const { data: link } = await supabase
        .from("agency_talent_links").select("display_name").eq("id", contract.talent_link_id).maybeSingle();
      talentName = link?.display_name ?? null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: invoice, error } = await supabase
      .from("agency_billing_docs")
      .insert({
        agency_id: agencyId,
        kind: "invoice",
        number: data.number,
        client_name: contract.contract_client_name ?? null,
        talent_name: talentName,
        issued_at: data.issued_at ?? today,
        due_date: data.due_date ?? null,
        currency: contract.contract_currency ?? "ZAR",
        total_cents: data.total_cents,
        status: "draft",
        notes: data.notes ?? null,
        contract_document_id: contract.id,
      })
      .select().single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "create_contract_invoice", "agency_billing_doc", invoice.id,
      `${invoice.number} for ${contract.name}`, { contract_id: contract.id });

    return invoice;
  });

// -----------------------------------------------------------------------------
// M4 — Document Requests (review workflow)
// -----------------------------------------------------------------------------

const reviewReasonCodes = z.enum([
  "illegible", "wrong_document", "expired", "incomplete", "wrong_person", "other",
]);

export const listAgencyDocumentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: rows, error } = await supabase
      .from("agency_document_requests")
      .select("id, talent_link_id, title, folder, instructions, status, due_date, reason_code, review_notes, reviewed_at, created_at, updated_at, current_document_id")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const linkIds = Array.from(new Set((rows ?? []).map((r: any) => r.talent_link_id).filter(Boolean)));
    const talentMap = new Map<string, string>();
    if (linkIds.length) {
      const { data: links } = await supabase
        .from("agency_talent_links").select("id, display_name").in("id", linkIds);
      for (const l of links ?? []) talentMap.set(l.id as string, l.display_name as string);
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id, talentLinkId: r.talent_link_id,
      talentName: talentMap.get(r.talent_link_id) ?? "Unknown",
      title: r.title, folder: r.folder, instructions: r.instructions,
      status: r.status, dueDate: r.due_date,
      reasonCode: r.reason_code, reviewNotes: r.review_notes,
      reviewedAt: r.reviewed_at, createdAt: r.created_at, updatedAt: r.updated_at,
      currentDocumentId: r.current_document_id,
    }));
  });

export const getAgencyDocumentRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: req, error } = await supabase
      .from("agency_document_requests")
      .select("*")
      .eq("id", data.id).eq("agency_id", agencyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Request not found");

    const { data: history } = await supabase
      .from("agency_document_request_history")
      .select("id, event, document_id, reason_code, notes, actor_email, created_at")
      .eq("request_id", data.id)
      .order("created_at", { ascending: false });

    return { request: req, history: history ?? [] };
  });

export const createAgencyDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    talent_link_id: z.string().uuid(),
    title: z.string().min(1).max(200),
    folder: z.string().min(1).max(100),
    instructions: z.string().max(2000).nullable().optional(),
    due_date: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data: row, error } = await supabase
      .from("agency_document_requests")
      .insert({
        agency_id: agencyId,
        talent_link_id: data.talent_link_id,
        requested_by: userId,
        title: data.title,
        folder: data.folder,
        instructions: data.instructions ?? null,
        due_date: data.due_date ?? null,
      })
      .select().single();
    if (error) throw new Error(error.message);
    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "create_document_request", "agency_document_request", row.id, data.title);
    return row;
  });

export const reviewAgencyDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    outcome: z.enum(["completed", "resubmission_required", "cancelled"]),
    reason_code: reviewReasonCodes.optional(),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);

    if (data.outcome === "resubmission_required" && !data.reason_code) {
      throw new Error("A reason code is required when requesting resubmission.");
    }

    const { data: req, error: rErr } = await supabase
      .from("agency_document_requests")
      .select("id, title, current_document_id")
      .eq("id", data.id).eq("agency_id", agencyId).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!req) throw new Error("Request not found");

    const { data: updated, error } = await supabase
      .from("agency_document_requests")
      .update({
        status: data.outcome,
        reason_code: data.reason_code ?? null,
        review_notes: data.notes ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id).eq("agency_id", agencyId)
      .select().single();
    if (error) throw new Error(error.message);

    // History row — never delete previous submissions.
    await supabase.from("agency_document_request_history").insert({
      request_id: data.id,
      agency_id: agencyId,
      event: data.outcome,
      document_id: req.current_document_id,
      reason_code: data.reason_code ?? null,
      notes: data.notes ?? null,
      actor_id: userId,
      actor_email: claims?.email ?? null,
    });

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      `review_document_request_${data.outcome}`, "agency_document_request",
      req.id, req.title, { reason_code: data.reason_code ?? null });

    return updated;
  });
