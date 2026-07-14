import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  await supabase.from("agency_audit_log").insert({
    agency_id: agencyId,
    actor_id: userId,
    actor_email: email ?? null,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    target_label: targetLabel ?? null,
    detail,
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

export const createTalentInvitationMine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      talent_name: z.string().min(1),
      email: z.string().email(),
      expiry_days: z.number().int().min(1).max(60).default(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    await assertAgencyOwner(supabase, userId, agencyId);
    const expires_at = new Date(Date.now() + data.expiry_days * 86400000).toISOString();

    const { data: inv, error } = await supabase
      .from("talent_invitations")
      .insert({
        agency_id: agencyId,
        talent_name: data.talent_name,
        email: data.email,
        expires_at,
        invited_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgencyAudit(supabase, agencyId, userId, claims?.email,
      "create_talent_invitation", "talent_invitation", inv.id, data.talent_name,
      { email: data.email, expires_at });
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
      .select("id, name, folder, status, validity_expires_at, storage_path, talent_link_id, uploaded_by, created_at, updated_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = docs ?? [];
    const linkIds = Array.from(new Set(rows.map((r: any) => r.talent_link_id).filter(Boolean)));
    let talentMap = new Map<string, string>();
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
    }));
  });

export const listAgencyTalentLinksLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { agencyId } = await getCallerAgency(supabase, userId);
    const { data, error } = await supabase
      .from("agency_talent_links")
      .select("id, display_name")
      .eq("agency_id", agencyId)
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ id: r.id as string, displayName: r.display_name as string }));
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
      .select("id, agency_id, name, storage_path, folder")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.agency_id !== agencyId) throw new Error("Forbidden");

    if (row.storage_path) {
      const { error: rmErr } = await supabase.storage
        .from("talent-documents").remove([row.storage_path]);
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
