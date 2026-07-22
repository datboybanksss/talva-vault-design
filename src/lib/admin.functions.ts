import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function assertAdminCanEdit(supabase: any, userId: string) {
  await assertAdmin(supabase, userId);
  const { data, error } = await supabase.rpc("can_admin_edit", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: view-only administrators cannot perform this action.");
}

async function assertMainAdmin(supabase: any, userId: string) {
  await assertAdmin(supabase, userId);
  const { data, error } = await supabase.rpc("is_main_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: main administrator only.");
}

async function logAudit(
  supabase: any,
  userId: string,
  email: string | undefined,
  action: string,
  targetType?: string,
  targetId?: string,
  targetLabel?: string,
  detail: Record<string, unknown> = {},
) {
  await supabase.from("admin_audit_log").insert({
    actor_id: userId,
    actor_email: email ?? null,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    target_label: targetLabel ?? null,
    detail,
  });
}

// -----------------------------------------------------------------------------
// Session / whoami
// -----------------------------------------------------------------------------
export const whoami = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, is_main_admin, permission_level")
      .eq("user_id", userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, first_name, last_name, designation")
      .eq("id", userId)
      .maybeSingle();
    const adminRow = (roles ?? []).find((r: any) => r.role === "admin");
    const isAdmin = !!adminRow;
    const isMain = !!adminRow?.is_main_admin;
    const permissionLevel: "view_only" | "edit" =
      (adminRow?.permission_level as any) ?? "edit";
    const canEdit = isAdmin && permissionLevel === "edit";
    return {
      userId: userId as string,
      email: (profile?.email as string) ?? (claims?.email as string) ?? "",
      displayName: (profile?.display_name as string) ?? "",
      firstName: (profile?.first_name as string) ?? "",
      lastName: (profile?.last_name as string) ?? "",
      designation: (profile?.designation as string) ?? "",
      avatarUrl: (profile?.avatar_url as string) ?? null,
      isAdmin,
      isMainAdmin: isMain,
      permissionLevel,
      canEdit,
      roles: roles ?? [],
    };
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        first_name: z.string().trim().max(80).optional().default(""),
        last_name: z.string().trim().max(80).optional().default(""),
        designation: z.string().trim().max(120).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);

    // Load current profile + is-main-admin so we can enforce that only Main
    // Admins may change their own designation.
    const { data: current } = await supabase
      .from("profiles")
      .select("designation")
      .eq("id", userId)
      .maybeSingle();
    const { data: isMain } = await supabase.rpc("is_main_admin", {
      _user_id: userId,
    });

    const currentDesignation = (current?.designation as string | null) ?? null;
    const requestedDesignation = data.designation || null;
    const designationChanged = requestedDesignation !== currentDesignation;
    if (designationChanged && !isMain) {
      throw new Error(
        "Forbidden: only the Main Administrator can change the designation field.",
      );
    }
    // Non-main admins can save name changes; keep existing designation intact.
    const nextDesignation = isMain ? requestedDesignation : currentDesignation;

    const display_name =
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
      (claims?.email ? String(claims.email).split("@")[0] : null);

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        designation: nextDesignation,
        display_name,
      })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "update_own_profile",
      "user",
      userId,
      display_name ?? claims?.email ?? "self",
      {
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        designation: nextDesignation,
        designation_changed: designationChanged,
      },
    );
    return updated;
  });

export const logOwnEmailChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ new_email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "request_own_email_change",
      "user",
      userId,
      claims?.email ?? "self",
      { new_email: data.new_email },
    );
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Dashboard metrics
// -----------------------------------------------------------------------------
export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const [agencies, talent, docs, shares] = await Promise.all([
      supabase.from("agencies").select("id, status"),
      supabase
        .from("talent_profiles")
        .select("id, is_test, deleted_at")
        .is("deleted_at", null)
        .eq("is_test", false),
      supabase.from("agency_documents").select("shared_folder_count, private_vault_count"),
      supabase.from("loved_one_shares").select("id").eq("is_active", true),
    ]);

    const statusCounts: Record<string, number> = {
      incomplete: 0,
      invited: 0,
      accepted: 0,
      expired: 0,
      declined: 0,
      suspended: 0,
    };
    for (const a of agencies.data ?? []) {
      statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    }

    const totalAgencies = agencies.data?.length ?? 0;
    const totalTalent = talent.data?.length ?? 0;
    const totalDocs =
      (docs.data ?? []).reduce(
        (sum: number, d: any) =>
          sum + (d.shared_folder_count ?? 0) + (d.private_vault_count ?? 0),
        0,
      ) ?? 0;
    const activeShares = shares.data?.length ?? 0;

    return {
      totalAgencies,
      statusCounts,
      totalTalent,
      totalDocuments: totalDocs,
      activeShares,
      suspendedAgencies: statusCounts.suspended,
      refreshedAt: new Date().toISOString(),
    };
  });

// -----------------------------------------------------------------------------
// Agencies
// -----------------------------------------------------------------------------
export const listAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("agencies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // talent counts per agency
    const { data: talent } = await supabase
      .from("talent_profiles")
      .select("agency_id")
      .is("deleted_at", null)
      .eq("is_test", false);
    const talentByAgency = new Map<string, number>();
    for (const t of talent ?? []) {
      talentByAgency.set(t.agency_id, (talentByAgency.get(t.agency_id) ?? 0) + 1);
    }

    const { data: invitations } = await supabase
      .from("agency_invitations")
      .select("id, agency_id, agency_name, contact_person, email, token, status, expires_at, last_sent_at, send_count")
      .neq("status", "accepted")
      .neq("status", "revoked")
      .order("created_at", { ascending: false });

    const invitationByAgencyId = new Map<string, any>();
    const invitationByEmail = new Map<string, any>();
    const invitationByName = new Map<string, any>();
    for (const inv of invitations ?? []) {
      if (inv.agency_id && !invitationByAgencyId.has(inv.agency_id)) {
        invitationByAgencyId.set(inv.agency_id, inv);
      }
      const emailKey = String(inv.email ?? "").toLowerCase();
      if (emailKey && !invitationByEmail.has(emailKey)) invitationByEmail.set(emailKey, inv);
      const nameKey = String(inv.agency_name ?? "").toLowerCase();
      if (nameKey && !invitationByName.has(nameKey)) invitationByName.set(nameKey, inv);
    }

    return (data ?? []).map((a: any) => ({
      ...a,
      talent_count: talentByAgency.get(a.id) ?? 0,
      invitation:
        invitationByAgencyId.get(a.id) ??
        invitationByEmail.get(String(a.contact_email ?? "").toLowerCase()) ??
        invitationByName.get(String(a.name ?? "").toLowerCase()) ??
        null,
    }));
  });

export const getAgencyById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "view_agency",
      "agency",
      data.id,
      agency?.name,
    );
    return agency;
  });

export const suspendAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), reason: z.string().min(3) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: updated, error } = await supabase
      .from("agencies")
      .update({
        status: "suspended",
        suspension_reason: data.reason,
        suspended_at: new Date().toISOString(),
        suspended_by: userId,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "suspend_agency",
      "agency",
      data.id,
      updated.name,
      { reason: data.reason },
    );
    await supabase.from("admin_notifications").insert({
      kind: "suspended_review",
      title: `${updated.name} suspended — needs review`,
      detail: data.reason,
      target_type: "agency",
      target_id: data.id,
    });
    return updated;
  });

export const unsuspendAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: updated, error } = await supabase
      .from("agencies")
      .update({
        status: "accepted",
        suspension_reason: null,
        suspended_at: null,
        suspended_by: null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "unsuspend_agency",
      "agency",
      data.id,
      updated.name,
    );
    return updated;
  });

export const listAgencyInvitationsForAgency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agency_id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("agency_invitations")
      .select("*")
      .eq("agency_id", data.agency_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listTalentInvitationsForAgency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agency_id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("talent_invitations")
      .select("*")
      .eq("agency_id", data.agency_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getInvitationById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return inv;
  });

export const dismissNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("admin_notifications")
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissComputedNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.string(), snapshot: z.number().int().nonnegative() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("admin_notification_dismissals")
      .upsert(
        {
          user_id: userId,
          kind: data.kind,
          snapshot: data.snapshot,
          dismissed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,kind" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// -----------------------------------------------------------------------------
// Invitations
// -----------------------------------------------------------------------------
export const listAgencyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("agency_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Create as DRAFT — admin must upload compliance docs then call finalize.
export const createAgencyInvitationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agency_name: z.string().min(1),
        contact_person: z.string().optional(),
        email: z.string().email(),
        business_type: z.enum(["formal", "informal"]),
        expiry_days: z.number().int().min(1).max(60).default(14),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);

    const nowIso = new Date().toISOString();
    const { data: activeInv } = await supabase
      .from("agency_invitations")
      .select("id, agency_name, status, expires_at")
      .ilike("email", data.email)
      .in("status", ["pending", "draft"])
      .gt("expires_at", nowIso)
      .maybeSingle();
    if (activeInv?.id) {
      throw new Error(
        `An active ${activeInv.status} invitation for ${data.email} already exists (${activeInv.agency_name}). Delete or revoke it before inviting again.`,
      );
    }
    const { data: activeAgency } = await supabase
      .from("agencies")
      .select("id, name, status")
      .ilike("contact_email", data.email)
      .eq("status", "accepted")
      .maybeSingle();
    if (activeAgency?.id) {
      throw new Error(
        `${activeAgency.name} is already onboarded with ${data.email}. Use a different contact email.`,
      );
    }

    const expiresAt = new Date(
      Date.now() + data.expiry_days * 24 * 3600 * 1000,
    ).toISOString();

    const { data: agency, error: agencyErr } = await supabase
      .from("agencies")
      .insert({
        name: data.agency_name,
        contact_email: data.email,
        contact_person: data.contact_person ?? null,
        business_type: data.business_type,
        status: "invited",
        created_by: userId,
      })
      .select()
      .single();
    if (agencyErr) throw new Error(agencyErr.message);

    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .insert({
        agency_id: agency.id,
        agency_name: data.agency_name,
        contact_person: data.contact_person ?? null,
        email: data.email,
        expires_at: expiresAt,
        business_type: data.business_type,
        status: "draft",
        invited_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "create_agency_invitation_draft",
      "invitation",
      inv.id,
      data.agency_name,
      { email: data.email },
    );
    return inv;
  });

// Finalize: move draft -> pending after compliance docs uploaded.
const REQUIRED_FILE_SLOTS: Record<"formal" | "informal", string[]> = {
  formal: ["cipc", "director_id", "proof_of_address"],
  informal: ["sa_id", "proof_of_address"],
};

export const finalizeAgencyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string(),
        registered_contact_number: z.string().optional(),
        registered_mobile_number: z.string().optional(),
        expiry_days: z.number().int().min(1).max(60).default(14),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);

    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("id, agency_name, email, business_type, status")
      .eq("id", data.id)
      .single();
    if (iErr) throw new Error(iErr.message);
    if (inv.status !== "draft") {
      throw new Error(`Invitation is already ${inv.status}, cannot finalize.`);
    }
    const bt = inv.business_type as "formal" | "informal";
    if (!bt) throw new Error("Business type missing on invitation.");

    // Verify required files are present
    const { data: docs } = await supabase
      .from("agency_compliance_documents")
      .select("doc_slot")
      .eq("invitation_id", data.id);
    const uploadedSlots = new Set((docs ?? []).map((d: any) => d.doc_slot));
    const missing = REQUIRED_FILE_SLOTS[bt].filter((s) => !uploadedSlots.has(s));
    if (missing.length > 0) {
      throw new Error(
        `Missing required documents: ${missing.join(", ")}. Upload all before sending.`,
      );
    }
    // Verify required text fields
    if (bt === "formal" && !data.registered_contact_number?.trim()) {
      throw new Error("Registered business contact number is required.");
    }
    if (bt === "informal" && !data.registered_mobile_number?.trim()) {
      throw new Error("Registered mobile number is required.");
    }

    const expiresAt = new Date(
      Date.now() + data.expiry_days * 24 * 3600 * 1000,
    ).toISOString();
    const { data: updated, error: uErr } = await supabase
      .from("agency_invitations")
      .update({
        status: "pending",
        expires_at: expiresAt,
        last_sent_at: new Date().toISOString(),
        registered_contact_number: data.registered_contact_number ?? null,
        registered_mobile_number: data.registered_mobile_number ?? null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (uErr) throw new Error(uErr.message);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "finalize_agency_invitation",
      "invitation",
      data.id,
      inv.agency_name,
      { email: inv.email, expires_at: expiresAt },
    );
    return updated;
  });

// ---- Compliance documents ----
export const listComplianceDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invitation_id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("agency_compliance_documents")
      .select("*")
      .eq("invitation_id", data.invitation_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordComplianceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        invitation_id: z.string(),
        doc_slot: z.string().min(1),
        file_name: z.string().min(1),
        storage_path: z.string().min(1),
        mime_type: z.string().optional(),
        size_bytes: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("agency_id, business_type, agency_name")
      .eq("id", data.invitation_id)
      .single();
    if (iErr) throw new Error(iErr.message);
    if (!inv.business_type) throw new Error("Business type not set.");
    if (!data.storage_path.startsWith(`${data.invitation_id}/`)) {
      throw new Error("Invalid storage path.");
    }
    const { data: row, error } = await supabase
      .from("agency_compliance_documents")
      .insert({
        invitation_id: data.invitation_id,
        agency_id: inv.agency_id,
        business_type: inv.business_type,
        doc_slot: data.doc_slot,
        file_name: data.file_name,
        storage_path: data.storage_path,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        uploaded_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "upload_compliance_doc",
      "compliance_document",
      row.id,
      inv.agency_name,
      { slot: data.doc_slot, file: data.file_name },
    );
    return row;
  });

export const deleteComplianceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: doc, error: fErr } = await supabase
      .from("agency_compliance_documents")
      .select("id, storage_path, file_name, invitation_id")
      .eq("id", data.id)
      .single();
    if (fErr) throw new Error(fErr.message);
    await supabase.storage.from("agency-compliance-docs").remove([doc.storage_path]);
    const { error } = await supabase
      .from("agency_compliance_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "delete_compliance_doc",
      "compliance_document",
      data.id,
      doc.file_name,
      { invitation_id: doc.invitation_id },
    );
    return { ok: true };
  });

// Hard-delete an invitation (and its shell agency if empty). Distinct from revoke.
export const deleteAgencyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);

    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("*")
      .eq("id", data.id)
      .single();
    if (iErr) throw new Error(iErr.message);
    if (inv.status === "accepted") {
      throw new Error(
        "This invitation has been accepted — the agency is live. Use Suspend/Pause on the agency instead.",
      );
    }

    // Delete compliance storage objects, then DB rows (cascade also handles rows)
    const { data: docs } = await supabase
      .from("agency_compliance_documents")
      .select("storage_path")
      .eq("invitation_id", data.id);
    const paths = (docs ?? []).map((d: any) => d.storage_path);
    if (paths.length > 0) {
      await supabase.storage.from("agency-compliance-docs").remove(paths);
    }

    // Only delete the linked agency shell when it's still just an invited shell with no members
    let agencyDeleted = false;
    if (inv.agency_id) {
      const { data: ag } = await supabase
        .from("agencies")
        .select("id, status")
        .eq("id", inv.agency_id)
        .maybeSingle();
      if (ag && ag.status === "invited") {
        const { count } = await supabase
          .from("agency_members")
          .select("id", { head: true, count: "exact" })
          .eq("agency_id", inv.agency_id);
        if (!count) {
          const { error: delAgErr } = await supabase
            .from("agencies")
            .delete()
            .eq("id", inv.agency_id);
          if (!delAgErr) agencyDeleted = true;
        }
      }
    }

    const { error: delErr } = await supabase
      .from("agency_invitations")
      .delete()
      .eq("id", data.id);
    if (delErr) throw new Error(delErr.message);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "delete_agency_invitation",
      "invitation",
      data.id,
      inv.agency_name,
      {
        email: inv.email,
        prior_status: inv.status,
        agency_id: inv.agency_id,
        agency_deleted: agencyDeleted,
        compliance_docs_removed: paths.length,
        snapshot: inv,
      },
    );
    return { ok: true, agency_deleted: agencyDeleted };
  });

// Kept for back-compat — routes to draft creator. UI should call createAgencyInvitationDraft directly.
export const createAgencyInvitation = createAgencyInvitationDraft;

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), extend_days: z.number().default(14) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const expires_at = new Date(
      Date.now() + data.extend_days * 24 * 3600 * 1000,
    ).toISOString();
    const { data: current } = await supabase
      .from("agency_invitations")
      .select("send_count, agency_name")
      .eq("id", data.id)
      .single();
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .update({
        last_sent_at: new Date().toISOString(),
        send_count: (current?.send_count ?? 0) + 1,
        expires_at,
        status: "pending",
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "resend_invitation",
      "invitation",
      data.id,
      current?.agency_name,
      { new_expires_at: expires_at },
    );
    return inv;
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "revoke_invitation",
      "invitation",
      data.id,
      inv.agency_name,
    );
    return inv;
  });

export const updateInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdminCanEdit(supabase, userId);
    const { data: existing, error: exErr } = await supabase
      .from("agency_invitations")
      .select("status, email, agency_name")
      .eq("id", data.id)
      .single();
    if (exErr) throw new Error(exErr.message);
    if (existing.status === "accepted") {
      throw new Error(
        "BR-INV-004: This invitation has been accepted. Update the email via account settings instead.",
      );
    }
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .update({ email: data.email })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "update_invitation_email",
      "invitation",
      data.id,
      existing.agency_name,
      { old: existing.email, new: data.email },
    );
    return inv;
  });

export const logCopyLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    const { data: inv } = await supabase
      .from("agency_invitations")
      .select("agency_name")
      .eq("id", data.id)
      .maybeSingle();
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "copy_invitation_link",
      "invitation",
      data.id,
      inv?.agency_name,
    );
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -----------------------------------------------------------------------------
// Quotes & Invoices (read-only, BR-QI-002)
// -----------------------------------------------------------------------------
export const listBillingDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("agency_billing_docs")
      .select("*, agencies!inner(name)")
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "view_quotes_invoices",
      "report",
      "quotes-invoices",
      "Quotes & Invoices",
    );
    return (data ?? []).map((r: any) => ({
      ...r,
      agency_name: r.agencies?.name ?? "—",
    }));
  });

export const logBillingExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scope: z.string(), row_count: z.number() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "export_quotes_invoices",
      "report",
      "quotes-invoices",
      data.scope,
      { row_count: data.row_count },
    );
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Administrators
// -----------------------------------------------------------------------------
export const listAdministrators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("user_id, role, is_main_admin, permission_level, created_at")
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, display_name, designation")
      .in("id", ids);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (roles ?? []).map((r: any) => ({
      user_id: r.user_id,
      email: (profMap.get(r.user_id) as any)?.email ?? "",
      display_name: (profMap.get(r.user_id) as any)?.display_name ?? "",
      designation: (profMap.get(r.user_id) as any)?.designation ?? "",
      is_main_admin: r.is_main_admin,
      permission_level: r.permission_level as "view_only" | "edit",
      created_at: r.created_at,
    }));
  });

// -----------------------------------------------------------------------------
// Administrator invitations (Main-admin only for writes)
// -----------------------------------------------------------------------------
export const listAdminInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("admin_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const inviteAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        permission_level: z.enum(["view_only", "edit"]),
        expiry_days: z.number().int().min(1).max(60).default(14),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertMainAdmin(supabase, userId);

    // Reject if email is already an admin
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (existingProfile?.id) {
      const { data: hasAdmin } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", existingProfile.id)
        .eq("role", "admin")
        .maybeSingle();
      if (hasAdmin) throw new Error("That user is already an administrator.");
    }

    // Reject if a pending non-expired invite already exists
    const { data: dupe } = await supabase
      .from("admin_invitations")
      .select("id")
      .ilike("email", data.email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (dupe?.id) throw new Error("A pending invitation already exists for that email.");

    const expiresAt = new Date(
      Date.now() + data.expiry_days * 24 * 3600 * 1000,
    ).toISOString();

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .insert({
        email: data.email,
        permission_level: data.permission_level,
        invited_by: userId,
        invited_by_email: claims?.email ?? null,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "invite_administrator",
      "admin_invitation",
      inv.id,
      data.email,
      { permission_level: data.permission_level, expires_at: expiresAt },
    );
    return inv;
  });

export const revokeAdminInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertMainAdmin(supabase, userId);
    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "revoke_admin_invitation",
      "admin_invitation",
      data.id,
      inv.email,
      { permission_level: inv.permission_level },
    );
    return inv;
  });

// Records an audit event when a signed-in admin changes their OWN password.
// The password value itself is deliberately NEVER accepted or logged here —
// the actual credential update happens client-side via supabase.auth.
export const logOwnPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "change_own_password",
      "user",
      userId,
      claims?.email ?? "self",
    );
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Notifications (bell) — computed live from data
// -----------------------------------------------------------------------------
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const now = new Date();
    const in3days = new Date(now.getTime() + 3 * 24 * 3600 * 1000).toISOString();

    // Persisted notifications not dismissed
    const { data: persisted } = await supabase
      .from("admin_notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false });

    // Computed live signals
    const [expiring, expired, incomplete, talentPending, suspended] =
      await Promise.all([
        supabase
          .from("agency_invitations")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .lte("expires_at", in3days)
          .gt("expires_at", now.toISOString()),
        supabase
          .from("agency_invitations")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .lt("expires_at", now.toISOString()),
        supabase
          .from("agencies")
          .select("id", { count: "exact", head: true })
          .eq("status", "incomplete"),
        supabase
          .from("talent_invitations")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("agencies")
          .select("id", { count: "exact", head: true })
          .eq("status", "suspended"),
      ]);

    const computed: Array<{
      id: string;
      kind: string;
      snapshot: number;
      tone: string;
      title: string;
      detail: string;
      to?: string;
    }> = [];

    const push = (
      kind: string,
      count: number,
      tone: string,
      title: string,
      detail: string,
      to?: string,
    ) => {
      computed.push({ id: `auto-${kind}`, kind, snapshot: count, tone, title, detail, to });
    };

    if ((expiring.count ?? 0) > 0)
      push(
        "invite_expiring",
        expiring.count ?? 0,
        "amber",
        `${expiring.count} agency invite${expiring.count === 1 ? "" : "s"} expiring soon`,
        "Within the reminder window.",
        "/admin/invitations",
      );
    if ((expired.count ?? 0) > 0)
      push(
        "invite_expired",
        expired.count ?? 0,
        "red",
        `${expired.count} agency invite${expired.count === 1 ? "" : "s"} expired`,
        "Requires resend, correction or close-out.",
        "/admin/invitations",
      );
    if ((incomplete.count ?? 0) > 0)
      push(
        "agency_incomplete",
        incomplete.count ?? 0,
        "purple",
        `${incomplete.count} agenc${incomplete.count === 1 ? "y" : "ies"} incomplete`,
        "Onboarding or document review outstanding.",
        "/admin/agencies",
      );
    if ((talentPending.count ?? 0) > 0)
      push(
        "talent_invite_pending",
        talentPending.count ?? 0,
        "blue",
        `${talentPending.count} Talent invite${talentPending.count === 1 ? "" : "s"} pending`,
        "From agency-level Talent invites.",
        "/admin/agencies",
      );
    if ((suspended.count ?? 0) > 0)
      push(
        "suspended_review",
        suspended.count ?? 0,
        "red",
        `${suspended.count} suspended agenc${suspended.count === 1 ? "y" : "ies"} need${suspended.count === 1 ? "s" : ""} review`,
        "Suspension follow-up outstanding.",
        "/admin/agencies",
      );

    // Filter out computed reminders this admin has dismissed at the current count snapshot.
    const { data: dismissals } = await supabase
      .from("admin_notification_dismissals")
      .select("kind, snapshot")
      .eq("user_id", userId);
    const dismissedMap = new Map<string, number>(
      (dismissals ?? []).map((d: any) => [d.kind, d.snapshot]),
    );
    const visibleComputed = computed.filter(
      (c) => dismissedMap.get(c.kind) !== c.snapshot,
    );

    return { persisted: persisted ?? [], computed: visibleComputed };
  });



// -----------------------------------------------------------------------------
// MFA audit-log (never accepts or logs codes or secrets)
// -----------------------------------------------------------------------------
export const logMfaEnrolled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ factor_type: z.string().default("totp") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "mfa_enrolled",
      "user",
      userId,
      claims?.email ?? "self",
      { factor_type: data.factor_type },
    );
    return { ok: true };
  });

export const logMfaDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    await assertAdmin(supabase, userId);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "mfa_disabled",
      "user",
      userId,
      claims?.email ?? "self",
    );
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Main-admin only: edit another (or own) administrator's designation and/or
// permission level. Server-side enforcement is authoritative.
// -----------------------------------------------------------------------------
export const updateAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        designation: z.string().trim().max(120).nullable().optional(),
        permission_level: z.enum(["view_only", "edit"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    await assertMainAdmin(supabase, userId);

    // Load target role + profile to build a proper audit diff and to protect
    // main admins from being demoted to view-only via this path.
    const { data: targetRole, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role, is_main_admin, permission_level")
      .eq("user_id", data.user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!targetRole) throw new Error("That user is not an administrator.");

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, email, display_name, designation")
      .eq("id", data.user_id)
      .maybeSingle();

    const targetLabel =
      (targetProfile?.display_name as string) ||
      (targetProfile?.email as string) ||
      data.user_id;

    const changes: Record<string, { from: string | null; to: string | null }> = {};

    // Designation
    if (data.designation !== undefined) {
      const nextDesignation = data.designation && data.designation.length > 0
        ? data.designation
        : null;
      const currentDesignation = (targetProfile?.designation as string | null) ?? null;
      if (nextDesignation !== currentDesignation) {
        const { error: pErr } = await supabase
          .from("profiles")
          .update({ designation: nextDesignation })
          .eq("id", data.user_id);
        if (pErr) throw new Error(pErr.message);
        changes.designation = { from: currentDesignation, to: nextDesignation };
      }
    }

    // Permission level (guard against demoting main admins here — they always keep 'edit')
    if (data.permission_level && data.permission_level !== targetRole.permission_level) {
      if (targetRole.is_main_admin && data.permission_level !== "edit") {
        throw new Error("The Main Administrator must retain edit rights.");
      }
      const { error: uErr } = await supabase
        .from("user_roles")
        .update({ permission_level: data.permission_level })
        .eq("user_id", data.user_id)
        .eq("role", "admin");
      if (uErr) throw new Error(uErr.message);
      changes.permission_level = {
        from: targetRole.permission_level,
        to: data.permission_level,
      };
    }

    if (Object.keys(changes).length > 0) {
      await logAudit(
        supabase,
        userId,
        claims?.email,
        data.user_id === userId ? "update_own_admin_profile" : "update_admin_profile",
        "user",
        data.user_id,
        targetLabel,
        { changes },
      );
    }

    return { ok: true, changes };
  });

