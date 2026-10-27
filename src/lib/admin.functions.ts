import { duplicateOnboardingName, blockedReplacements } from "./onboarding-documents";
import { databaseError } from "./security-errors";
import { allQueryRows } from "./query-results";
import { agencyInvitationStatusInput } from "./invitation-status-input";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesUpdate } from "@/integrations/supabase/types";

type AdminClient = SupabaseClient<Database>;
type AdminAuditDetail = Record<string, Json | undefined>;
import { isValidPhone, normalisePhone, PHONE_FORMAT_MESSAGE } from "@/lib/phone";
import { mapEffectiveStatus, effectiveInvitationStatus } from "@/lib/invitation-status";
import {
  ADMIN_AGENCY_INVITATION_KIND,
  INVITATION_STATUSES,
  type InvitationType,
  INVITATION_TYPES,
  normaliseInvitationStatus,
  normaliseInvitationType,
} from "@/lib/invitation-filters";
import { matchesSearch, normaliseSearch } from "@/lib/search";
import { fetchOnboardedTalentLinks, fetchTalentSplit } from "@/lib/onboarded-talent";
import {
  accountOptionCounts,
  filterAccounts,
  normaliseAccountStatus,
  normaliseAccountType,
  normaliseAccountScope,
  normaliseTalentLink,
  talentAccountStatus,
  agencyAccountStatus,
} from "@/lib/account-filters";

import {
  HIGHEST_ADMIN_PERMISSION,
  canInviteAdministrators,
  canSupportAgencies,
  grantableAdminPermissions,
} from "@/lib/admin-permissions";

/** Every permission level an administrator invitation may carry. */
const ADMIN_PERMISSION_ENUM = z.enum(["view_only", "agency_support", "edit"]);

/**
 * Turns a field path into a readable label: `registered_contact_number` →
 * "Registered contact number".
 */
function fieldLabel(path: (string | number)[]): string {
  const raw = path.filter((p) => typeof p === "string").join(" ");
  if (!raw) return "";
  const words = raw.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Validates server-function input and converts a ZodError into a single clean,
 * human-readable sentence. Without this the raw issues array was JSON-stringified
 * straight into the toast the user sees.
 */
export function parseInput<T extends z.ZodTypeAny>(schema: T, d: unknown): z.infer<T> {
  const result = schema.safeParse(d);
  if (result.success) return result.data;

  const messages = result.error.issues.map((issue) => {
    const label = fieldLabel(issue.path as (string | number)[]);
    if (issue.code === "invalid_string" && issue.validation === "email") {
      return "Invalid email address";
    }
    if (issue.code === "invalid_type" && issue.received === "undefined") {
      return label ? `${label} is required` : "A required value is missing";
    }
    const detail = issue.message.replace(/^String must contain/, "Must contain");
    return label ? `${label}: ${detail.charAt(0).toLowerCase() + detail.slice(1)}` : detail;
  });

  const unique = [...new Set(messages)];
  throw new Error(unique.join(". ") + ".");
}

/** Optional international phone number, stored in normalised E.164 form. */
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => normalisePhone(v))
  .refine((v) => v === "" || isValidPhone(v), { message: PHONE_FORMAT_MESSAGE })
  .optional();

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
async function assertAdmin(supabase: AdminClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: admin only");
}

async function assertAdminCanEdit(supabase: AdminClient, userId: string) {
  await assertAdmin(supabase, userId);
  const { data, error } = await supabase.rpc("can_admin_edit", { _user_id: userId });
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: view-only administrators cannot perform this action.");
}

/**
 * Reads the caller's stored admin permission level. The Main Administrator is
 * always treated as holding the highest level.
 */
async function adminPermissionLevel(supabase: AdminClient, userId: string) {
  const { data: row, error } = await supabase
    .from("user_roles")
    .select("is_main_admin, permission_level")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw databaseError(error);
  const isMainAdmin = !!row?.is_main_admin;
  return {
    isMainAdmin,
    permissionLevel: isMainAdmin
      ? HIGHEST_ADMIN_PERMISSION
      : ((row?.permission_level ?? "view_only") as string),
  };
}

/**
 * Agency-support actions (resend/revoke/correct/copy an AGENCY invitation) are
 * open to Agency Support administrators as well as full-edit ones.
 */
async function assertAdminCanSupportAgencies(supabase: AdminClient, userId: string) {
  await assertAdmin(supabase, userId);
  const { permissionLevel } = await adminPermissionLevel(supabase, userId);
  if (!canSupportAgencies(permissionLevel)) {
    throw new Error("Forbidden: view-only administrators cannot perform this action.");
  }
  return permissionLevel;
}

async function assertMainAdmin(supabase: AdminClient, userId: string) {
  await assertAdmin(supabase, userId);
  const { data, error } = await supabase.rpc("is_main_admin", { _user_id: userId });
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: main administrator only.");
}

/**
 * Administrator invitations may be sent by the Main Administrator or by any
 * administrator holding the highest permission level. Returns the inviter's
 * own level so the caller can cap what they are allowed to grant.
 */
async function assertCanInviteAdministrator(supabase: AdminClient, userId: string) {
  await assertAdmin(supabase, userId);
  const { data: row, error } = await supabase
    .from("user_roles")
    .select("is_main_admin, permission_level")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw databaseError(error);
  const permissionLevel = (row?.permission_level ?? "view_only") as string;
  const isMainAdmin = !!row?.is_main_admin;
  if (!isMainAdmin && !canInviteAdministrators(permissionLevel)) {
    throw new Error(
      "Forbidden: only administrators with full access may invite other administrators.",
    );
  }
  return {
    isMainAdmin,
    // The Main Administrator is always treated as holding the highest level.
    permissionLevel: isMainAdmin ? HIGHEST_ADMIN_PERMISSION : permissionLevel,
  };
}

/** An inviter may only grant a permission level at or below their own. */
function assertGrantablePermission(inviterLevel: string, requested: string) {
  const allowed = grantableAdminPermissions(inviterLevel).some((p) => p.value === requested);
  if (!allowed) {
    throw new Error("Forbidden: you cannot grant a permission level above your own.");
  }
}

/** Agency talent invitations that can never be accepted; excluded from admin counts. */
async function inertInvitationIds(supabase: AdminClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("talent_invite_private")
    .select("invitation_id")
    .eq("kind", "inert");
  return new Set((data ?? []).map((r) => r.invitation_id));
}

async function logAudit(
  supabase: AdminClient,
  userId: string,
  email: string | undefined,
  action: string,
  targetType?: string,
  targetId?: string,
  targetLabel?: string | null,
  detail: AdminAuditDetail = {},
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
    const { supabase, userId, claims } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, is_main_admin, permission_level")
      .eq("user_id", userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, first_name, last_name, designation")
      .eq("id", userId)
      .maybeSingle();
    const adminRow = (roles ?? []).find((r) => r.role === "admin");
    const isAdmin = !!adminRow;
    const isMain = !!adminRow?.is_main_admin;
    const permissionLevel: "view_only" | "agency_support" | "edit" = isMain
      ? "edit"
      : (adminRow?.permission_level ?? "edit");
    const canEdit = isAdmin && permissionLevel === "edit";
    // Agency Support sits between view-only and full edit: it may act on
    // agency invitations but not suspend agencies or manage administrators.
    const canSupport = isAdmin && canSupportAgencies(permissionLevel);
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
      canSupportAgencies: canSupport,
      roles: roles ?? [],
    };
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        first_name: z.string().trim().max(80).optional().default(""),
        last_name: z.string().trim().max(80).optional().default(""),
        designation: z.string().trim().max(120).optional().default(""),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
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
      throw new Error("Forbidden: only the Main Administrator can change the designation field.");
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
    if (error) throw databaseError(error);

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
    parseInput(z.object({ new_email: z.string().max(10000).email() }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
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
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Counts use head-only exact counts so the dashboard never streams whole
    // tables back just to call .length on them.
    const nowIso = new Date().toISOString();
    const head = { count: "exact" as const, head: true };
    const [
      agencies,
      talentSplit,
      docs,
      shares,
      talentInvites,
      linkRequests,
      agencyInvites,
      agencyDrafts,
      talentDrafts,
    ] = await Promise.all([
      supabase.from("agencies").select("id, status"),
      // Shared definition with the Reporting page — see src/lib/onboarded-talent.ts.
      fetchTalentSplit(supabase),
      supabase.from("agency_documents").select("shared_folder_count, private_vault_count"),
      supabase
        // Admins read share metadata through the token-free admin view.
        .from("admin_loved_one_shares_view")
        .select("id", { count: "exact", head: true })
        .eq("is_currently_active", true),
      // Admin-sent (independent) talent invitations only — agency-sent talent
      // invites are not counted here.
      supabase
        .from("independent_talent_invitations")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gt("expires_at", nowIso),
      // Open connection requests live in the private record (agencies can't
      // see them); inert invitations are not requests.
      supabase
        .from("talent_invite_private")
        .select("invitation_id, talent_invitations!inner(status, expires_at)", {
          count: "exact",
          head: true,
        })
        .eq("kind", "link_request")
        .eq("state", "pending")
        .eq("talent_invitations.status", "pending")
        .gt("talent_invitations.expires_at", nowIso),
      // Sent, unexpired agency invitations (drafts excluded).
      supabase
        .from("agency_invitations")
        .select("id", head)
        .eq("kind", ADMIN_AGENCY_INVITATION_KIND)
        .eq("status", "pending")
        .gt("expires_at", nowIso),
      supabase
        .from("agency_invitations")
        .select("id", head)
        .eq("kind", ADMIN_AGENCY_INVITATION_KIND)
        .eq("status", "draft"),
      supabase.from("independent_talent_invitations").select("id", head).eq("status", "draft"),
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
    const totalTalent = talentSplit.total;
    const totalDocs =
      (docs.data ?? []).reduce(
        (sum: number, d) => sum + (d.shared_folder_count ?? 0) + (d.private_vault_count ?? 0),
        0,
      ) ?? 0;
    const activeShares = shares.count ?? 0;

    return {
      totalAgencies,
      statusCounts,
      totalTalent,
      agencyLinkedTalent: talentSplit.agencyLinked,
      independentTalent: talentSplit.independent,
      openTalentInvites: talentInvites.count ?? 0,
      openAgencyInvites: agencyInvites.count ?? 0,
      draftInvites: (agencyDrafts.count ?? 0) + (talentDrafts.count ?? 0),
      pendingLinkRequests: linkRequests.count ?? 0,
      totalDocuments: totalDocs,
      activeShares,
      suspendedAgencies: statusCounts.suspended,
      refreshedAt: new Date().toISOString(),
    };
  });

// -----------------------------------------------------------------------------
// Agencies
// -----------------------------------------------------------------------------
async function loadAgenciesWithInvitations(supabase: AdminClient) {
  const { data, error } = await supabase
    .from("agencies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw databaseError(error);

  // talent counts per agency — same definition as the dashboard and Reporting
  const talent = await fetchOnboardedTalentLinks(supabase);
  const talentByAgency = new Map<string, number>();
  for (const t of talent) {
    talentByAgency.set(t.agency_id, (talentByAgency.get(t.agency_id) ?? 0) + 1);
  }

  const { data: invitations } = await supabase
    .from("agency_invitations")
    .select(
      "id, agency_id, agency_name, contact_person, email, token, status, expires_at, last_sent_at, send_count",
    )
    .neq("status", "accepted")
    .neq("status", "revoked")
    .order("created_at", { ascending: false });

  type AgencyInvitation = NonNullable<typeof invitations>[number];
  const invitationByAgencyId = new Map<string, AgencyInvitation>();
  const invitationByEmail = new Map<string, AgencyInvitation>();
  const invitationByName = new Map<string, AgencyInvitation>();
  for (const inv of invitations ?? []) {
    if (inv.agency_id && !invitationByAgencyId.has(inv.agency_id)) {
      invitationByAgencyId.set(inv.agency_id, inv);
    }
    const emailKey = String(inv.email ?? "").toLowerCase();
    if (emailKey && !invitationByEmail.has(emailKey)) invitationByEmail.set(emailKey, inv);
    const nameKey = String(inv.agency_name ?? "").toLowerCase();
    if (nameKey && !invitationByName.has(nameKey)) invitationByName.set(nameKey, inv);
  }

  return (data ?? []).map((a) => ({
    ...a,
    talent_count: talentByAgency.get(a.id) ?? 0,
    invitation:
      invitationByAgencyId.get(a.id) ??
      invitationByEmail.get(String(a.contact_email ?? "").toLowerCase()) ??
      invitationByName.get(String(a.name ?? "").toLowerCase()) ??
      null,
  }));
}

export const listAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    return loadAgenciesWithInvitations(supabase);
  });

/**
 * Admin Accounts: agencies and talent in one list. Filtering, counting and
 * windowing happen here on the server; the browser receives one page.
 */
export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        type: z.string().max(10000).default("all"),
        status: z.string().max(10000).default("all"),
        link: z.string().max(10000).default("all"),
        accounts: z.string().max(10000).default("all"),
        q: z.string().max(200).default(""),
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().min(0).max(5000).default(0),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const filters = {
      type: normaliseAccountType(data.type),
      status: normaliseAccountStatus(data.status),
      link: normaliseTalentLink(data.link),
      scope: normaliseAccountScope(data.accounts, "all"),
      q: normaliseSearch(data.q),
    };
    const agencies = await loadAgenciesWithInvitations(supabase);
    const agencyName = new Map<string, string>(agencies.map((a) => [a.id, a.name]));

    const { data: profiles, error: pErr } = await supabase
      .from("talent_profiles")
      .select(
        "id, user_id, full_name, email, created_at, activation_completed_at, is_test, paused_at, suspended_at",
      )
      .is("deleted_at", null);
    if (pErr) throw databaseError(pErr);
    const userIds = (profiles ?? []).map((p) => p.user_id).filter(Boolean);
    const linksByUser = new Map<string | null, string[]>();
    if (userIds.length) {
      const { data: links, error: lErr } = await supabase
        .from("agency_talent_links")
        .select("talent_user_id, agency_id, status")
        .in("talent_user_id", userIds)
        .in("status", ["active", "needs_review"]);
      if (lErr) throw databaseError(lErr);
      for (const l of links ?? []) {
        const name = agencyName.get(l.agency_id);
        if (!name) continue;
        const list = linksByUser.get(l.talent_user_id) ?? [];
        if (!list.includes(name)) list.push(name);
        linksByUser.set(l.talent_user_id, list);
      }
    }

    const all = [
      ...agencies.map((a) => ({
        ...a,
        key: `agency-${a.id}`,
        type: "agency" as const,
        stored_status: a.status,
        status: agencyAccountStatus(a),
        is_paused: !!a.paused_at,
        is_suspended: a.status === "suspended",
        is_test: !!a.is_test,
        joined_at: a.created_at,
        search_text: [
          a.name,
          a.contact_person,
          [a.main_contact_first_name, a.main_contact_last_name].filter(Boolean).join(" "),
          a.contact_email,
          a.main_contact_email,
          a.invitation?.contact_person,
          a.invitation?.email,
        ],
      })),
      ...(profiles ?? []).map((p) => ({
        key: `talent-${p.id}`,
        id: p.id,
        user_id: p.user_id,
        type: "talent" as const,
        name: p.full_name || p.email || "Unnamed talent",
        email: p.email,
        status: talentAccountStatus(p.activation_completed_at, p),
        is_paused: !!p.paused_at,
        is_suspended: !!p.suspended_at,
        linked_agencies: linksByUser.get(p.user_id) ?? [],
        is_test: !!p.is_test,
        joined_at: p.activation_completed_at ?? p.created_at,
        // Linked agency names: searching an agency also finds its talent.
        search_text: [p.full_name, p.email, ...(linksByUser.get(p.user_id) ?? [])],
      })),
    ].sort((a, b) => (a.joined_at < b.joined_at ? 1 : -1));

    const matching = filterAccounts(all, filters);
    return {
      rows: matching
        .slice(data.offset, data.offset + data.limit)
        .map(({ search_text: _s, ...r }) => r),
      total: matching.length,
      counts: accountOptionCounts(all, filters),
    };
  });

/** Marks or unmarks an agency or talent account as a test account (audited). */
export const setAccountTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({ type: z.enum(["agency", "talent"]), id: z.string().uuid(), isTest: z.boolean() }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.type === "agency" ? "agencies" : "talent_profiles";
    const label = data.type === "agency" ? "name" : "full_name";
    const { data: row, error } = await supabaseAdmin
      .from(table)
      .update({ is_test: data.isTest })
      .eq("id", data.id)
      .select(`id, ${label}`)
      // The table and label are paired above; dynamic projection inference cannot retain that pairing.
      .maybeSingle()
      .overrideTypes<{ id: string; name?: string; full_name?: string | null }, { merge: false }>();
    if (error) throw databaseError(error);
    if (!row) throw new Error("We couldn't find that account.");
    await logAudit(
      supabase,
      userId,
      claims?.email,
      data.isTest ? "mark_test_account" : "unmark_test_account",
      data.type,
      data.id,
      row[label] ?? undefined,
      { is_test: data.isTest },
    );
    return { ok: true };
  });

/** Admin talent account page: the profile, live agency links and account state. */
export const getTalentAccountById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    const { data: p, error } = await admin
      .from("talent_profiles")
      .select(
        "id, user_id, full_name, email, created_at, activation_completed_at, is_test, paused_at, pause_reason, pause_note, suspended_at, suspension_reason, suspension_note",
      )
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!p) return null;
    let agencies: { name: string; status: string }[] = [];
    if (p.user_id) {
      const { data: links } = await admin
        .from("agency_talent_links")
        .select("status, agencies(name)")
        .eq("talent_user_id", p.user_id);
      agencies = (links ?? []).map((l) => ({
        name: l.agencies?.name ?? "—",
        status: l.status,
      }));
    }
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "view_talent",
      "talent",
      data.id,
      p.full_name || p.email,
    );
    return {
      ...p,
      status: talentAccountStatus(p.activation_completed_at, p),
      agencies,
    };
  });

export const getAgencyById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdmin(supabase, userId);
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw databaseError(error);
    await logAudit(supabase, userId, claims?.email, "view_agency", "agency", data.id, agency?.name);
    return agency;
  });

/** Years of read-only access after a suspension (the one database number). */
export const getReadOnlyYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase.rpc("post_end_read_only_years");
    if (error) throw databaseError(error);
    return { years: Number(data) };
  });

const BAN_DURATION = "876000h"; // ~100 years; lifted on unpause

/** Blocks sign-in (and token refresh) for these users; returns the ones we banned. */
async function banUsers(admin: AdminClient, userIds: string[]): Promise<string[]> {
  const banned: string[] = [];
  for (const id of [...new Set(userIds)]) {
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: id, _role: "admin" });
    if (isAdmin) continue;
    const { data: u } = await admin.auth.admin.getUserById(id);
    const until = u?.user?.banned_until ? new Date(u.user.banned_until).getTime() : 0;
    if (until > Date.now()) continue; // already blocked for another reason: leave it alone
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: BAN_DURATION });
    if (error) throw databaseError(error);
    banned.push(id);
  }
  // End verified two-step sessions so nothing carries on after the pause.
  if (banned.length) await admin.from("mfa_verified_sessions").delete().in("user_id", banned);
  return banned;
}

async function unbanUsers(admin: AdminClient, userIds: string[]) {
  for (const id of [...new Set(userIds)]) {
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
    if (error) throw databaseError(error);
  }
}

/**
 * Pause / unpause / suspend / unsuspend an agency or talent account (Admin
 * with edit rights only). Allowed transitions come from accountStateActions;
 * pause never touches suspension, so unpausing restores the previous state.
 */
export const changeAccountState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        type: z.enum(["agency", "talent"]),
        id: z.string().uuid(),
        action: z.enum(["pause", "unpause", "suspend", "unsuspend"]),
        reason: z.string().max(40).optional(),
        note: z.string().trim().max(1000).optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);
    const { canApplyAccountAction, isValidReason, reasonsFor } =
      await import("@/lib/account-state");
    const needsReason = data.action === "pause" || data.action === "suspend";
    if (needsReason && !isValidReason(data.action as "pause" | "suspend", data.reason ?? "")) {
      throw new Error("Choose a reason.");
    }
    const note = data.note?.trim() || null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    const table = data.type === "agency" ? "agencies" : "talent_profiles";
    const { data: selectedRow, error: rErr } = await admin
      .from(table)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw databaseError(rErr);
    // The selected table determines these variant fields; keep the existing type-based accesses unchanged.
    const row = selectedRow as (Tables<"agencies"> | Tables<"talent_profiles">) &
      Partial<Tables<"agencies"> & Tables<"talent_profiles">>;
    if (!row || (data.type === "talent" && row.deleted_at))
      throw new Error("We couldn't find that account.");
    const state = {
      paused: !!row.paused_at,
      suspended: data.type === "agency" ? row.status === "suspended" : !!row.suspended_at,
    };
    if (!canApplyAccountAction(data.action, state)) {
      throw new Error("That action isn't available for this account's current status.");
    }
    const now = new Date().toISOString();
    let patch: Pick<
      TablesUpdate<"agencies">,
      | "paused_at"
      | "paused_by"
      | "pause_reason"
      | "pause_note"
      | "paused_banned_user_ids"
      | "status"
      | "suspended_at"
      | "suspended_by"
      | "suspension_reason"
      | "suspension_note"
    > &
      Pick<TablesUpdate<"talent_profiles">, "paused_banned"> = {};

    if (data.action === "pause") {
      let userIds: string[] = [];
      if (data.type === "agency") {
        const { data: members } = await admin
          .from("agency_members")
          .select("user_id")
          .eq("agency_id", data.id);
        userIds = (members ?? []).map((m) => m.user_id).filter(Boolean);
      } else if (row.user_id) userIds = [row.user_id];
      const banned = await banUsers(admin, userIds);
      patch = {
        paused_at: now,
        paused_by: userId,
        pause_reason: data.reason,
        pause_note: note,
        ...(data.type === "agency"
          ? { paused_banned_user_ids: banned }
          : { paused_banned: banned.length > 0 }),
      };
    } else if (data.action === "unpause") {
      const toUnban: string[] =
        data.type === "agency"
          ? (row.paused_banned_user_ids ?? [])
          : row.paused_banned && row.user_id
            ? [row.user_id]
            : [];
      await unbanUsers(admin, toUnban);
      patch = {
        paused_at: null,
        paused_by: null,
        pause_reason: null,
        pause_note: null,
        ...(data.type === "agency" ? { paused_banned_user_ids: [] } : { paused_banned: false }),
      };
    } else if (data.action === "suspend") {
      patch = {
        ...(data.type === "agency" ? { status: "suspended" } : {}),
        suspended_at: now,
        suspended_by: userId,
        suspension_reason: data.reason,
        suspension_note: note,
      };
    } else {
      patch = {
        ...(data.type === "agency" ? { status: "accepted" } : {}),
        suspended_at: null,
        suspended_by: null,
        suspension_reason: null,
        suspension_note: null,
      };
    }

    const { error: uErr } = await admin
      .from(table)
      // Variant-only patch keys are selected by data.type above; the dynamic table union loses that correlation.
      .update(
        patch as Pick<
          TablesUpdate<"agencies">,
          | "paused_at"
          | "paused_by"
          | "pause_reason"
          | "pause_note"
          | "suspended_at"
          | "suspended_by"
          | "suspension_reason"
          | "suspension_note"
        >,
      )
      .eq("id", data.id);
    if (uErr) throw databaseError(uErr);
    const label = data.type === "agency" ? row.name : row.full_name || row.email;
    await logAudit(
      supabase,
      userId,
      claims?.email,
      `${data.action}_${data.type}`,
      data.type,
      data.id,
      label,
      {
        ...(needsReason
          ? {
              reason: data.reason,
              reason_label: reasonsFor(data.action as "pause" | "suspend")[data.reason!],
            }
          : {}),
        note,
      },
    );
    if (data.action === "suspend" && data.type === "agency") {
      await supabase.from("admin_notifications").insert({
        kind: "suspended_review",
        title: `${row.name} suspended — needs review`,
        detail: reasonsFor("suspend")[data.reason!],
        target_type: "agency",
        target_id: data.id,
      });
    }
    return { ok: true };
  });

export const listAgencyInvitationsForAgency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ agency_id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("agency_invitations")
      .select("*")
      .eq("agency_id", data.agency_id)
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error);
    return mapEffectiveStatus(rows);
  });

export const listTalentInvitationsForAgency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ agency_id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("talent_invitations")
      .select("*")
      .eq("agency_id", data.agency_id)
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error);
    // Inert invitations (to staff/admin accounts etc.) are not real invitations.
    const inert = await inertInvitationIds(supabase);
    return mapEffectiveStatus((rows ?? []).filter((r) => !inert.has(r.id)));
  });

export const getInvitationById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw databaseError(error);
    return inv;
  });

export const dismissNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("admin_notifications")
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
      .eq("id", data.id);
    if (error) throw databaseError(error);
    return { ok: true };
  });

export const dismissComputedNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({ kind: z.string().max(10000), snapshot: z.number().int().nonnegative() }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("admin_notification_dismissals").upsert(
      {
        user_id: userId,
        kind: data.kind,
        snapshot: data.snapshot,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,kind" },
    );
    if (error) throw databaseError(error);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Invitations
// -----------------------------------------------------------------------------
export const listAgencyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("agency_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error);
    return mapEffectiveStatus(data);
  });

/**
 * Server-paged agency invitations.
 *
 * The full list is never fetched: the status tab, the search box and the batch
 * window are all applied in the database, and the tab counts come back as
 * counts rather than rows. "Expired" is derived (a pending invitation whose
 * expiry has passed), so it is expressed here as a date filter.
 */
export const listAgencyInvitationsPaged = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        status: agencyInvitationStatusInput.default("all"),
        search: z.string().max(10000).default(""),
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const nowIso = new Date().toISOString();

    const invitationQueries = () => ({
      list: supabase.from("agency_invitations").select("*", { count: "exact" }),
      count: supabase.from("agency_invitations").select("id", { count: "exact", head: true }),
    });
    const applyFilters = <
      Q extends
        | ReturnType<typeof invitationQueries>["list"]
        | ReturnType<typeof invitationQueries>["count"],
    >(
      q: Q,
      status: z.infer<typeof agencyInvitationStatusInput>,
    ) => {
      let out:
        | ReturnType<typeof invitationQueries>["list"]
        | ReturnType<typeof invitationQueries>["count"] = q;
      if (status === "expired") {
        out = out.eq("status", "pending").lt("expires_at", nowIso);
      } else if (status === "pending") {
        out = out.eq("status", "pending").gte("expires_at", nowIso);
      } else if (status !== "all") {
        out = out.eq("status", status);
      }
      const term = data.search.trim();
      if (term) {
        const like = `%${term.replace(/[%,()]/g, "")}%`;
        out = out.or(`agency_name.ilike.${like},email.ilike.${like},contact_person.ilike.${like}`);
      }
      // Filters preserve the caller's selected row projection.
      return out as Q;
    };

    const tabs = ["all", "draft", "pending", "accepted", "expired", "declined", "revoked"] as const;
    const countResults = await Promise.all(
      tabs.map((t) =>
        applyFilters(
          supabase.from("agency_invitations").select("id", { count: "exact", head: true }),
          t,
        ),
      ),
    );
    const counts: Record<string, number> = {};
    tabs.forEach((t, i) => {
      counts[t] = countResults[i]?.count ?? 0;
    });

    const {
      data: rows,
      error,
      count,
    } = await applyFilters(
      supabase.from("agency_invitations").select("*", { count: "exact" }),
      data.status,
    )
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw databaseError(error);

    return {
      rows: mapEffectiveStatus(rows),
      total: count ?? 0,
      counts,
    };
  });

/**
 * Admin overview: agency and talent invitations in one list, newest first.
 * Type and status are filtered in the database; each type contributes at most
 * offset + limit rows before the merge, so no query is unbounded. Counts per
 * type and status come back as counts, never rows.
 */
export const listCombinedInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        type: z.string().max(10000).default("all"),
        status: z.string().max(10000).default("all"),
        email: z.string().max(320).default(""),
        q: z.string().max(200).default(""),
        accounts: z.string().max(10000).default("all"),
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().min(0).max(500).default(0),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const type = normaliseInvitationType(data.type);
    const status = normaliseInvitationStatus(data.status);
    const email = data.email.trim().replace(/[%_,()]/g, "");
    const nowIso = new Date().toISOString();
    const scope = normaliseAccountScope(data.accounts, "all");
    // Test accounts: agency invitations by their agency, talent invitations by email.
    const [{ data: testAg }, { data: testTal }] = await Promise.all([
      supabase.from("agencies").select("id").eq("is_test", true),
      supabase.from("talent_profiles").select("email").eq("is_test", true),
    ]);
    const testAgencyIds: string[] = (testAg ?? []).map((r) => r.id);
    const testEmails: string[] = (testTal ?? [])
      .map((r) =>
        String(r.email ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    // Search box: matched on the server across names, contact person and
    // email (accent-insensitive), then applied as an id filter so counts,
    // filters and paging all respect it.
    const term = normaliseSearch(data.q);
    const searchIds: Record<InvitationType, string[] | null> = { agency: null, talent: null };
    if (term) {
      const [ag, ta] = await Promise.all([
        allQueryRows((from, to) =>
          supabase
            .from("agency_invitations")
            .select("id, agency_name, contact_person, email")
            .eq("kind", ADMIN_AGENCY_INVITATION_KIND)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allQueryRows((from, to) =>
          supabase
            .from("independent_talent_invitations")
            .select("id, talent_name, email")
            .order("id", { ascending: true })
            .range(from, to),
        ),
      ]);
      searchIds.agency = ag
        .filter((r) => matchesSearch([r.agency_name, r.contact_person, r.email], term))
        .map((r) => r.id);
      searchIds.talent = ta
        .filter((r) => matchesSearch([r.talent_name, r.email], term))
        .map((r) => r.id);
    }
    const quoteList = (xs: string[]) => xs.map((x) => `"${x.replace(/"/g, "")}"`).join(",");
    type AgencyInvite = Tables<"agency_invitations">;
    type TalentInvite = Tables<"independent_talent_invitations">;
    type InvitationFilterRow = {
      [K in keyof AgencyInvite | keyof TalentInvite]?:
        | (K extends keyof AgencyInvite ? AgencyInvite[K] : never)
        | (K extends keyof TalentInvite ? TalentInvite[K] : never);
    };
    type InvitationQuery<R> = PostgrestFilterBuilder<
      Database["__InternalSupabase"],
      Database["public"],
      AgencyInvite | TalentInvite,
      R,
      "agency_invitations" | "independent_talent_invitations"
    >;
    const byScope = <R>(q: InvitationQuery<R>, t: InvitationType) => {
      if (scope === "all") return q;
      const ids = t === "agency" ? testAgencyIds : testEmails;
      const col = t === "agency" ? "agency_id" : "email";
      if (scope === "test")
        return ids.length ? q.in(col, ids) : q.eq("id", "00000000-0000-0000-0000-000000000000");
      if (!ids.length) return q;
      return t === "agency"
        ? q.or(`agency_id.is.null,agency_id.not.in.(${quoteList(ids)})`)
        : q.not("email", "in", `(${quoteList(ids)})`);
    };
    const isTestRow = (r: Pick<InvitationFilterRow, "agency_id" | "email">, t: InvitationType) =>
      t === "agency"
        ? !!r.agency_id && testAgencyIds.includes(r.agency_id)
        : testEmails.includes(
            String(r.email ?? "")
              .trim()
              .toLowerCase(),
          );
    const TABLE = {
      agency: {
        table: "agency_invitations",
        cols: "id, agency_id, agency_name, contact_person, email, status, expires_at, created_at, updated_at, last_sent_at, send_count, token",
      },
      talent: {
        table: "independent_talent_invitations",
        cols: "id, talent_name, email, status, expires_at, created_at, updated_at, last_sent_at, send_count, acceptance_unavailable_at",
      },
    } as const;
    // Only agency onboarding invitations: agency staff invitations share the
    // agency_invitations table (kind = 'staff') and are not Admin invitations.
    const byStatus = <R>(q0: InvitationQuery<R>, s: string, t: InvitationType) => {
      const q1 = byScope(
        t === "agency"
          ? // Only agency queries take this branch; the union exposes common column keys only.
            (q0.eq as (column: "kind", value: AgencyInvite["kind"]) => InvitationQuery<R>)(
              "kind",
              ADMIN_AGENCY_INVITATION_KIND,
            )
          : q0,
        t,
      );
      const q2 = email ? q1.ilike("email", `%${email}%`) : q1;
      const ids = searchIds[t];
      const q =
        ids === null
          ? q2
          : q2.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (s === "expired") return q.eq("status", "pending").lt("expires_at", nowIso);
      if (s === "pending") return q.eq("status", "pending").gte("expires_at", nowIso);
      if (s !== "all")
        // Normalisation precedes this helper; keep its existing string contract and database filter.
        return q.eq("status", s as Tables<"agency_invitations">["status"]);
      return q;
    };

    const keys = ["all", ...INVITATION_STATUSES];
    const countJobs = INVITATION_TYPES.flatMap((t) =>
      keys.map(async (s) => {
        const { count } = await byStatus(
          supabase.from(TABLE[t].table).select("id", { count: "exact", head: true }),
          s,
          t,
        );
        return [t, s, count ?? 0] as const;
      }),
    );
    const counts: Record<string, Record<string, number>> = { agency: {}, talent: {} };
    for (const [t, s, n] of await Promise.all(countJobs)) counts[t][s] = n;

    const types = type === "all" ? [...INVITATION_TYPES] : [type];
    const { registrationCopy } = await import("./registration-copy.server");
    const unavailableLabel = (await registrationCopy()).acceptance_unavailable;
    const window = data.offset + data.limit;
    const fetched = await Promise.all(
      types.map(async (t) => {
        const { data: rows, error } = await byStatus(
          supabase.from(TABLE[t].table).select(TABLE[t].cols),
          status,
          t,
        )
          .order("created_at", { ascending: false })
          .range(0, window - 1)
          // Table and columns are paired by t; dynamic select inference otherwise cross-combines them.
          .overrideTypes<
            Array<
              | Pick<
                  AgencyInvite,
                  | "id"
                  | "agency_id"
                  | "agency_name"
                  | "contact_person"
                  | "email"
                  | "status"
                  | "expires_at"
                  | "created_at"
                  | "updated_at"
                  | "last_sent_at"
                  | "send_count"
                  | "token"
                >
              | Pick<
                  TalentInvite,
                  | "id"
                  | "talent_name"
                  | "acceptance_unavailable_at"
                  | "email"
                  | "status"
                  | "expires_at"
                  | "created_at"
                  | "updated_at"
                  | "last_sent_at"
                  | "send_count"
                >
            >,
            { merge: false }
          >();
        if (error) throw databaseError(error);
        return (rows ?? []).map((r) => ({
          ...r,
          type: t,
          // The table discriminator selects the matching name field; retain the original direct field access.
          name:
            t === "agency"
              ? (r as { agency_name?: AgencyInvite["agency_name"] }).agency_name
              : (r as { talent_name?: TalentInvite["talent_name"] }).talent_name,
          stored_status: r.status as string,
          status: "acceptance_unavailable_at" in r && r.acceptance_unavailable_at ? unavailableLabel : effectiveInvitationStatus(r.status, r.expires_at),
          is_test: isTestRow(r, t),
        }));
      }),
    );
    const rows = fetched
      .flat()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(data.offset, window);
    const total = types.reduce((n, t) => n + (counts[t][status] ?? 0), 0);
    return { rows, total, counts };
  });

// Create as DRAFT — admin must upload compliance docs then call finalize.
export const createAgencyInvitationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        agency_name: z.string().max(10000).min(1),
        contact_person: z.string().max(10000).optional(),
        email: z.string().max(10000).email(),
        business_type: z.enum(["formal", "informal"]),
        expiry_days: z.number().int().min(1).max(60).default(14),
        onboarding_session_id: z.string().uuid().optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);

    const { assertInviteEmailFree } = await import("@/lib/invite-email-check.server");
    await assertInviteEmailFree({ flow: "admin_agency", email: data.email });
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

    const expiresAt = new Date(Date.now() + data.expiry_days * 24 * 3600 * 1000).toISOString();

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
    if (agencyErr) throw databaseError(agencyErr);

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
    if (error) throw databaseError(error);

    // Files uploaded before the draft existed are attached in this same step.
    let attached = 0;
    if (data.onboarding_session_id) {
      const { attachStagedUploads } = await import("@/lib/onboarding-staging.server");
      try {
        attached = await attachStagedUploads(userId, data.onboarding_session_id, {
          kind: "agency",
          invitationId: inv.id,
          agencyId: agency.id,
          businessType: data.business_type,
        });
      } catch (e) {
        // Never leave a half-saved draft behind: undo it and keep the staged files.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("agency_compliance_documents")
          .delete()
          .eq("invitation_id", inv.id);
        await supabaseAdmin.from("agency_invitations").delete().eq("id", inv.id);
        await supabaseAdmin.from("agencies").delete().eq("id", agency.id).eq("status", "invited");
        throw e;
      }
    }

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "create_agency_invitation_draft",
      "invitation",
      inv.id,
      data.agency_name,
      { email: data.email, attached_documents: attached },
    );
    return inv;
  });

// Update an existing DRAFT — stays editable until it is finalised.
export const updateAgencyInvitationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        id: z.string().max(10000),
        agency_name: z.string().max(10000).min(1).optional(),
        contact_person: z.string().max(10000).optional(),
        email: z.string().max(10000).email().optional(),
        business_type: z.enum(["formal", "informal"]).optional(),
        expiry_days: z.number().int().min(1).max(60).optional(),
        registered_contact_number: phoneSchema,
        registered_mobile_number: phoneSchema,
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);

    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("id, agency_id, agency_name, email, status")
      .eq("id", data.id)
      .single();
    if (iErr) throw databaseError(iErr);
    if (inv.status !== "draft") {
      throw new Error(
        `This invitation is already ${inv.status} and can no longer be edited as a draft.`,
      );
    }

    const nextEmail = data.email ?? inv.email;
    if (data.email && data.email.toLowerCase() !== (inv.email ?? "").toLowerCase()) {
      const { assertInviteEmailFree } = await import("@/lib/invite-email-check.server");
      await assertInviteEmailFree({ flow: "admin_agency", email: data.email, excludeId: data.id });
      const { data: activeAgency } = await supabase
        .from("agencies")
        .select("id, name")
        .ilike("contact_email", data.email)
        .eq("status", "accepted")
        .maybeSingle();
      if (activeAgency?.id) {
        throw new Error(
          `${activeAgency.name} is already onboarded with ${data.email}. Use a different contact email.`,
        );
      }
    }

    const patch: TablesUpdate<"agency_invitations"> = {};
    if (data.agency_name !== undefined) patch.agency_name = data.agency_name;
    if (data.contact_person !== undefined) patch.contact_person = data.contact_person || null;
    if (data.email !== undefined) patch.email = data.email;
    if (data.business_type !== undefined) patch.business_type = data.business_type;
    if (data.registered_contact_number !== undefined)
      patch.registered_contact_number = data.registered_contact_number || null;
    if (data.registered_mobile_number !== undefined)
      patch.registered_mobile_number = data.registered_mobile_number || null;
    if (data.expiry_days !== undefined) {
      patch.expires_at = new Date(Date.now() + data.expiry_days * 24 * 3600 * 1000).toISOString();
    }
    patch.updated_at = new Date().toISOString();

    const { data: updated, error: uErr } = await supabase
      .from("agency_invitations")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (uErr) throw databaseError(uErr);

    if (inv.agency_id) {
      const agencyPatch: TablesUpdate<"agencies"> = {};
      if (data.agency_name !== undefined) agencyPatch.name = data.agency_name;
      if (data.email !== undefined) agencyPatch.contact_email = nextEmail;
      if (data.contact_person !== undefined)
        agencyPatch.contact_person = data.contact_person || null;
      if (data.business_type !== undefined) agencyPatch.business_type = data.business_type;
      if (Object.keys(agencyPatch).length > 0) {
        await supabase.from("agencies").update(agencyPatch).eq("id", inv.agency_id);
      }
    }

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "update_agency_invitation_draft",
      "invitation",
      data.id,
      updated.agency_name,
      { changed: Object.keys(patch).filter((k) => k !== "updated_at") },
    );
    return updated;
  });

// Finalize: move draft -> pending after compliance docs uploaded.
const REQUIRED_FILE_SLOTS: Record<"formal" | "informal", string[]> = {
  formal: ["cipc", "director_id", "proof_of_address"],
  informal: ["sa_id", "proof_of_address"],
};

export const finalizeAgencyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        id: z.string().max(10000),
        registered_contact_number: phoneSchema,
        registered_mobile_number: phoneSchema,
        expiry_days: z.number().int().min(1).max(60).default(14),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);

    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("id, agency_name, email, business_type, status")
      .eq("id", data.id)
      .single();
    if (iErr) throw databaseError(iErr);
    if (inv.status !== "draft") {
      throw new Error(`Invitation is already ${inv.status}, cannot finalize.`);
    }
    const { assertInviteEmailFree } = await import("@/lib/invite-email-check.server");
    await assertInviteEmailFree({ flow: "admin_agency", email: inv.email, excludeId: inv.id });
    const bt = inv.business_type as "formal" | "informal";
    if (!bt) throw new Error("Business type missing on invitation.");

    // Verify required files are present
    const { data: docs } = await supabase
      .from("agency_compliance_documents")
      .select("doc_slot")
      .eq("invitation_id", data.id)
      .not("validated_at", "is", null)
      .is("quarantine_reason", null);
    const uploadedSlots = new Set((docs ?? []).map((d) => d.doc_slot));
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

    const expiresAt = new Date(Date.now() + data.expiry_days * 24 * 3600 * 1000).toISOString();
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
    if (uErr) throw databaseError(uErr);

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
  .inputValidator((d: unknown) => parseInput(z.object({ invitation_id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("agency_compliance_documents")
      .select("*")
      .eq("invitation_id", data.invitation_id)
      .order("created_at", { ascending: true });
    if (error) throw databaseError(error);
    return rows ?? [];
  });

export const recordComplianceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        invitation_id: z.string().max(10000),
        doc_slot: z.string().max(10000).min(1),
        file_name: z.string().max(10000).min(1),
        storage_path: z.string().max(10000).min(1),
        mime_type: z.string().max(10000).optional(),
        size_bytes: z.number().optional(),
        onboarding_session_id: z.string().uuid().optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);
    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("agency_id, business_type, agency_name")
      .eq("id", data.invitation_id)
      .single();
    if (iErr) throw databaseError(iErr);
    if (!inv.business_type) throw new Error("Business type not set.");
    if (!data.storage_path.startsWith(`${data.invitation_id}/`)) {
      throw new Error("Invalid storage path.");
    }

    // TVA-SEC-004: compliance documents are uploaded browser -> storage, so the
    // declared name/type/size are untrusted. Verify the stored bytes.
    const { validateStoredUpload } = await import("@/lib/file-validation.server");
    const checkedUpload = await validateStoredUpload({
      bucket: "agency-compliance-docs",
      path: data.storage_path,
      claimedMime: data.mime_type ?? null,
    });

    // A given file name may only be uploaded once per agency onboarding record,
    // across every document slot. Compared case-insensitively.
    const { data: existingDocs, error: exErr } = await supabase
      .from("agency_compliance_documents")
      .select("id, doc_slot, file_name, quarantine_reason, storage_path")
      .eq("invitation_id", data.invitation_id);
    if (exErr) throw databaseError(exErr);
    const clash = duplicateOnboardingName(existingDocs ?? [], data.file_name);
    if (clash) {
      // Remove the just-uploaded object so no orphan is left in storage.
      await supabase.storage.from("agency-compliance-docs").remove([data.storage_path]);
      throw new Error(
        `A document named "${data.file_name}" has already been uploaded for this agency.`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("agency_compliance_documents")
      .insert({
        invitation_id: data.invitation_id,
        agency_id: inv.agency_id,
        business_type: inv.business_type,
        doc_slot: data.doc_slot,
        file_name: data.file_name,
        storage_path: data.storage_path,
        mime_type: checkedUpload.mimeType,
        validated_at: new Date().toISOString(),
        size_bytes: checkedUpload.sizeBytes,
        uploaded_by: userId,
      })
      .select()
      .single();
    if (error) throw databaseError(error);
    // Blocked attached rows are replaced atomically by the insert trigger.
    const oldPaths = blockedReplacements(existingDocs ?? [], data.doc_slot, data.file_name).map(
      (r) => r.storage_path,
    );
    const storedOldPaths = oldPaths.filter((path): path is string => typeof path === "string");
    if (storedOldPaths.length)
      await supabaseAdmin.storage.from("agency-compliance-docs").remove(storedOldPaths);
    const { removeBlockedStagedReplacement } = await import("./onboarding-replacement.server");
    await removeBlockedStagedReplacement(
      userId,
      data.onboarding_session_id,
      "agency",
      data.doc_slot,
      data.file_name,
    );
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
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);
    const { data: doc, error: fErr } = await supabase
      .from("agency_compliance_documents")
      .select("id, storage_path, file_name, invitation_id")
      .eq("id", data.id)
      .single();
    if (fErr) throw databaseError(fErr);
    await supabase.storage.from("agency-compliance-docs").remove([doc.storage_path]);
    const { error } = await supabase.from("agency_compliance_documents").delete().eq("id", data.id);
    if (error) throw databaseError(error);
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
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanEdit(supabase, userId);

    const { data: inv, error: iErr } = await supabase
      .from("agency_invitations")
      .select("*")
      .eq("id", data.id)
      .single();
    if (iErr) throw databaseError(iErr);
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
    const paths = (docs ?? []).map((d) => d.storage_path);
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

    const { error: delErr } = await supabase.from("agency_invitations").delete().eq("id", data.id);
    if (delErr) throw databaseError(delErr);

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
    parseInput(z.object({ id: z.string().max(10000), extend_days: z.number().default(14) }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanSupportAgencies(supabase, userId);
    const expires_at = new Date(Date.now() + data.extend_days * 24 * 3600 * 1000).toISOString();
    const { data: current } = await supabase
      .from("agency_invitations")
      .select("send_count, agency_name, status")
      .eq("id", data.id)
      .single();
    // Resend reopens an invitation that is genuinely still open. It must never
    // resurrect a revoked, declined or accepted one, nor push an unfinalised
    // draft live without the compliance checks that Finalise performs.
    if (current?.status !== "pending") {
      throw new Error(
        current?.status === "draft"
          ? "This invitation is still a draft. Finalise it (which checks the required documents) before it can be sent."
          : `This invitation is ${current?.status ?? "unavailable"} and can no longer be resent. Create a new invitation instead.`,
      );
    }
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
    if (error) throw databaseError(error);
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
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanSupportAgencies(supabase, userId);
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!inv) throw new Error("Only an open invitation can be revoked.");
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
    parseInput(z.object({ id: z.string().max(10000), email: z.string().max(10000).email() }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanSupportAgencies(supabase, userId);
    const { data: existing, error: exErr } = await supabase
      .from("agency_invitations")
      .select("status, email, agency_name")
      .eq("id", data.id)
      .single();
    if (exErr) throw databaseError(exErr);
    if (existing.status === "accepted") {
      throw new Error(
        "BR-INV-004: This invitation has been accepted. Update the email via account settings instead.",
      );
    }
    if (existing.status !== "pending") {
      throw new Error("Only an open invitation's email address can be changed.");
    }
    const { assertInviteEmailFree } = await import("@/lib/invite-email-check.server");
    await assertInviteEmailFree({ flow: "admin_agency", email: data.email, excludeId: data.id });
    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .update({ email: data.email })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw databaseError(error);
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
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdminCanSupportAgencies(supabase, userId);
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

/** Admin copied an independent talent invite link — logged like agency invite copies. */
export const logTalentInviteCopyLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertAdmin(supabase, userId);
    const { data: inv } = await supabase
      .from("independent_talent_invitations")
      .select("talent_name, email")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found");
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "copy_talent_invitation_link",
      "talent_invitation",
      data.id,
      inv.talent_name ?? inv.email,
      { email: inv.email },
    );
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
        search: z.string().max(10000).default(""),
        actions: z.array(z.string()).max(200).optional(),
        excludeActions: z.array(z.string()).max(200).optional(),
      }),
      d ?? {},
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.actions?.length) q = q.in("action", data.actions);
    if (data.excludeActions?.length)
      q = q.not("action", "in", `(${data.excludeActions.join(",")})`);
    if (data.search.trim()) {
      const s = data.search.trim().replace(/[%,()]/g, " ");
      q = q.or(`actor_email.ilike.%${s}%,action.ilike.%${s}%,target_label.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw databaseError(error);
    return rows ?? [];
  });

/** Aggregates for the audit KPI tiles and area chips (unaffected by paging). */
export const getAuditLogSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("action, actor_email, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw databaseError(error);
    const rows = data ?? [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const byAction: Record<string, number> = {};
    const actors = new Set<string>();
    let today = 0;
    for (const r of rows) {
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      actors.add(r.actor_email ?? "system");
      if (new Date(r.created_at) >= start) today += 1;
    }
    return { total: rows.length, today, actorCount: actors.size, byAction };
  });

// -----------------------------------------------------------------------------
// Quotes & Invoices (read-only, BR-QI-002)
// -----------------------------------------------------------------------------
export const listBillingDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("agency_billing_docs")
      .select("*, agencies!inner(name)")
      .order("issued_at", { ascending: false });
    if (error) throw databaseError(error);
    await logAudit(
      supabase,
      userId,
      claims?.email,
      "view_quotes_invoices",
      "report",
      "quotes-invoices",
      "Quotes & Invoices",
    );
    const ids = (data ?? []).filter((r) => r.kind === "invoice").map((r) => r.id);
    const received = new Map<string, number>();
    if (ids.length) {
      const { data: payments, error: paymentError } = await supabase
        .from("agency_invoice_payments")
        .select("doc_id, amount_cents")
        .in("doc_id", ids);
      if (paymentError) throw databaseError(paymentError);
      for (const p of payments ?? [])
        received.set(p.doc_id, (received.get(p.doc_id) ?? 0) + p.amount_cents);
    }
    return (data ?? []).map((r) => ({
      ...r,
      agency_name: r.agencies?.name ?? "—",
      received_cents: received.get(r.id) ?? 0,
    }));
  });

export const logBillingExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({ scope: z.string().max(10000), row_count: z.number() }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
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
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select(
        "user_id, role, is_main_admin, permission_level, created_at, suspended, suspended_at, suspended_reason",
      )
      .eq("role", "admin");
    if (error) throw databaseError(error);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, display_name, designation")
      .in("id", ids);
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (roles ?? []).map((r) => ({
      user_id: r.user_id,
      email: profMap.get(r.user_id)?.email ?? "",
      display_name: profMap.get(r.user_id)?.display_name ?? "",
      designation: profMap.get(r.user_id)?.designation ?? "",
      is_main_admin: r.is_main_admin,
      permission_level: r.permission_level as "view_only" | "agency_support" | "edit",
      suspended: !!r.suspended,
      suspended_at: r.suspended_at ?? null,
      suspended_reason: r.suspended_reason ?? null,
      created_at: r.created_at,
    }));
  });

// -----------------------------------------------------------------------------
// Administrator invitations (Main-admin only for writes)
// -----------------------------------------------------------------------------
export const listAdminInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("admin_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error);
    return mapEffectiveStatus(data);
  });

export const inviteAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        email: z.string().max(10000).email(),
        permission_level: ADMIN_PERMISSION_ENUM,
        expiry_days: z.number().int().min(1).max(60).default(14),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    // Any administrator at the highest permission level may invite colleagues;
    // the Main Administrator retains this ability too. Enforced server-side.
    const inviter = await assertCanInviteAdministrator(supabase, userId);
    assertGrantablePermission(inviter.permissionLevel, data.permission_level);

    const { assertInviteEmailFree } = await import("@/lib/invite-email-check.server");
    await assertInviteEmailFree({ flow: "admin_admin", email: data.email });

    const expiresAt = new Date(Date.now() + data.expiry_days * 24 * 3600 * 1000).toISOString();

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .insert({
        email: data.email.trim().toLowerCase(),
        permission_level: data.permission_level,
        invited_by: userId,
        invited_by_email: claims?.email ?? null,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) throw databaseError(error);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "invite_administrator",
      "admin_invitation",
      inv.id,
      data.email,
      {
        permission_level: data.permission_level,
        expires_at: expiresAt,
        inviter_permission_level: inviter.permissionLevel,
        inviter_is_main_admin: inviter.isMainAdmin,
      },
    );
    return inv;
  });

/**
 * Change the access level granted by an administrator invitation that has not
 * been accepted yet. Same authorisation as sending one: Main Administrator or
 * an administrator at the highest level, capped to their own grantable levels.
 */
export const updateAdminInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        id: z.string().max(10000),
        permission_level: ADMIN_PERMISSION_ENUM,
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const editor = await assertCanInviteAdministrator(supabase, userId);
    assertGrantablePermission(editor.permissionLevel, data.permission_level);

    const { data: current, error: cErr } = await supabase
      .from("admin_invitations")
      .select("id, email, permission_level, status")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw databaseError(cErr);
    if (!current) throw new Error("Invitation not found.");
    if (current.status !== "pending") {
      throw new Error(
        `This invitation is ${current.status} — only a pending invitation can be changed.`,
      );
    }

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .update({ permission_level: data.permission_level })
      .eq("id", data.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!inv) throw new Error("This invitation could not be updated.");

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "update_admin_invitation",
      "admin_invitation",
      inv.id,
      inv.email,
      {
        changes: {
          permission_level: {
            from: current.permission_level,
            to: data.permission_level,
          },
        },
      },
    );
    return inv;
  });

export const revokeAdminInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertCanInviteAdministrator(supabase, userId);

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!inv) throw new Error("Only an open invitation can be revoked.");
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

/**
 * Reopens an administrator invitation that is still open (pending, whether or
 * not it has already lapsed) by pushing its expiry out again. Accepted and
 * revoked invitations are deliberately not resendable.
 */
export const resendAdminInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({ id: z.string().max(10000), extend_days: z.number().default(14) }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertCanInviteAdministrator(supabase, userId);

    const { data: existing, error: exErr } = await supabase
      .from("admin_invitations")
      .select("id, email, status, permission_level")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw databaseError(exErr);
    if (!existing) throw new Error("Invitation not found.");
    if (existing.status !== "pending") {
      throw new Error(
        `This invitation is ${existing.status} and can no longer be resent. Invite the person again instead.`,
      );
    }

    const expires_at = new Date(Date.now() + data.extend_days * 24 * 3600 * 1000).toISOString();

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .update({ expires_at, status: "pending" })
      .eq("id", data.id)
      .select()
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!inv) throw new Error("You do not have permission to resend this invitation.");

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "resend_admin_invitation",
      "admin_invitation",
      inv.id,
      inv.email,
      { expires_at, permission_level: inv.permission_level },
    );
    return inv;
  });

/**
 * Permanently removes a stale administrator invitation. Only invitations that
 * were never accepted may be deleted, so the acceptance trail stays intact.
 */
export const deleteAdminInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertCanInviteAdministrator(supabase, userId);

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .select("id, email, status, permission_level, accepted_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!inv) throw new Error("Invitation not found.");
    if (inv.status === "accepted" || inv.accepted_at) {
      throw new Error("An accepted invitation cannot be deleted.");
    }

    // There is deliberately no delete policy on this table, so the removal
    // runs with service-role rights after the permission check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin
      .from("admin_invitations")
      .delete()
      .eq("id", data.id);
    if (delErr) throw databaseError(delErr);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "delete_admin_invitation",
      "admin_invitation",
      inv.id,
      inv.email,
      { previous_status: inv.status, permission_level: inv.permission_level },
    );
    return { deleted: true };
  });

// Records an audit event when a signed-in admin changes their OWN password.
// The password value itself is deliberately NEVER accepted or logged here —
// the actual credential update happens client-side via supabase.auth.
export const logOwnPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
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
    const { supabase, userId } = context;
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
    const [expiring, expired, incomplete, talentPending, suspended] = await Promise.all([
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
    // Inert invitations are not real invitations.
    const { count: inertPending } = await supabase
      .from("talent_invite_private")
      .select("invitation_id, talent_invitations!inner(status)", { count: "exact", head: true })
      .eq("kind", "inert")
      .eq("talent_invitations.status", "pending");
    const realTalentPending = Math.max(0, (talentPending.count ?? 0) - (inertPending ?? 0));
    if (realTalentPending > 0)
      push(
        "talent_invite_pending",
        realTalentPending,
        "blue",
        `${realTalentPending} Talent invite${realTalentPending === 1 ? "" : "s"} pending`,
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
      (dismissals ?? []).map((d) => [d.kind, d.snapshot]),
    );
    const visibleComputed = computed.filter((c) => dismissedMap.get(c.kind) !== c.snapshot);

    return { persisted: persisted ?? [], computed: visibleComputed };
  });

// -----------------------------------------------------------------------------
// MFA audit-log (never accepts or logs codes or secrets)
// -----------------------------------------------------------------------------
export const logMfaEnrolled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({ factor_type: z.string().max(10000).default("email_code") }), d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
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
    const { supabase, userId, claims } = context;
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
    parseInput(
      z.object({
        user_id: z.string().uuid(),
        designation: z.string().trim().max(120).nullable().optional(),
        permission_level: ADMIN_PERMISSION_ENUM.optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertMainAdmin(supabase, userId);

    // Load target role + profile to build a proper audit diff and to protect
    // main admins from being demoted to view-only via this path.
    const { data: targetRole, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role, is_main_admin, permission_level")
      .eq("user_id", data.user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (rErr) throw databaseError(rErr);
    if (!targetRole) throw new Error("That user is not an administrator.");

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, email, display_name, designation")
      .eq("id", data.user_id)
      .maybeSingle();

    const targetLabel =
      (targetProfile?.display_name as string) || (targetProfile?.email as string) || data.user_id;

    const changes: Record<string, { from: string | null; to: string | null }> = {};

    // Designation
    if (data.designation !== undefined) {
      const nextDesignation =
        data.designation && data.designation.length > 0 ? data.designation : null;
      const currentDesignation = (targetProfile?.designation as string | null) ?? null;
      if (nextDesignation !== currentDesignation) {
        const { error: pErr } = await supabase
          .from("profiles")
          .update({ designation: nextDesignation })
          .eq("id", data.user_id);
        if (pErr) throw databaseError(pErr);
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
      if (uErr) throw databaseError(uErr);
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

// -----------------------------------------------------------------------------
// Main-admin only: suspend / restore / remove an administrator.
// A suspended administrator stops satisfying has_role('admin'), so every portal
// gate, server function and RLS policy refuses them from their next navigation.
// -----------------------------------------------------------------------------
export const setAdministratorSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        user_id: z.string().uuid(),
        suspended: z.boolean(),
        reason: z.string().trim().max(400).nullable().optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertMainAdmin(supabase, userId);

    if (data.user_id === userId) {
      throw new Error("You cannot suspend your own administrator account.");
    }

    const { data: target, error: tErr } = await supabase
      .from("user_roles")
      .select("user_id, is_main_admin, permission_level, suspended")
      .eq("user_id", data.user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (tErr) throw databaseError(tErr);
    if (!target) throw new Error("That user is not an administrator.");
    if (target.is_main_admin) {
      throw new Error("The Main Administrator cannot be suspended.");
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", data.user_id)
      .maybeSingle();

    const { error: uErr } = await supabase
      .from("user_roles")
      .update({
        suspended: data.suspended,
        suspended_at: data.suspended ? new Date().toISOString() : null,
        suspended_by: data.suspended ? userId : null,
        suspended_reason: data.suspended ? (data.reason ?? null) : null,
      })
      .eq("user_id", data.user_id)
      .eq("role", "admin");
    if (uErr) throw databaseError(uErr);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      data.suspended ? "suspend_administrator" : "restore_administrator",
      "user",
      data.user_id,
      (prof?.display_name as string) || (prof?.email as string) || data.user_id,
      { reason: data.reason ?? null, permission_level: target.permission_level },
    );
    return { ok: true, suspended: data.suspended };
  });

export const removeAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ user_id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await assertMainAdmin(supabase, userId);

    if (data.user_id === userId) {
      throw new Error("You cannot remove your own administrator access.");
    }

    const { data: target, error: tErr } = await supabase
      .from("user_roles")
      .select("user_id, is_main_admin, permission_level")
      .eq("user_id", data.user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (tErr) throw databaseError(tErr);
    if (!target) throw new Error("That user is not an administrator.");
    if (target.is_main_admin) {
      throw new Error("The Main Administrator cannot be removed.");
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", data.user_id)
      .maybeSingle();

    const { error: dErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", "admin");
    if (dErr) throw databaseError(dErr);

    await logAudit(
      supabase,
      userId,
      claims?.email,
      "remove_administrator",
      "user",
      data.user_id,
      (prof?.display_name as string) || (prof?.email as string) || data.user_id,
      { permission_level: target.permission_level },
    );
    return { ok: true };
  });

// Single administrator invitation, used by the invitation email composer.
export const getAdminInvitationById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().max(10000) }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw databaseError(error);
    return inv;
  });
