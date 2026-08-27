import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Invitations opened by people who *already* have a TalVault account.
 *
 * The activation wizards create a brand-new auth user, which fails for anyone
 * already on the platform. These helpers let an existing account claim the
 * invitation instead: sign in normally, then attach the role / membership /
 * talent link that the invitation carries.
 *
 * Every claim is scoped by two things: the invitation token (a bearer secret)
 * and the signed-in account's own email, which must match the invited address.
 */

export const INVITE_KINDS = ["agency", "talent", "admin"] as const;
export type InviteKind = (typeof INVITE_KINDS)[number];

const kindSchema = z.enum(INVITE_KINDS);
const claimInput = z.object({
  token: z.string().min(10).max(200),
  kind: kindSchema,
});

/** Where a claimed invitation of each kind lands the user. */
export const INVITE_PORTAL_HOME: Record<InviteKind, string> = {
  agency: "/agency",
  talent: "/talent",
  admin: "/admin",
};

const INVITE_TABLE: Record<InviteKind, "agency_invitations" | "talent_invitations" | "admin_invitations"> = {
  agency: "agency_invitations",
  talent: "talent_invitations",
  admin: "admin_invitations",
};

export type InviteAccountStatus = {
  /** true when an account already exists for the invited email address */
  account_exists: boolean;
  email: string | null;
};

/**
 * Does the invited email already belong to a TalVault account? Answered from
 * the invitation token only — we never accept an email from the caller, so
 * this cannot be used to probe whether an arbitrary address is registered.
 */
export const inviteAccountStatus = createServerFn({ method: "POST" })
  .inputValidator((v) => claimInput.parse(v))
  .handler(async ({ data }): Promise<InviteAccountStatus> => {
    const { guardPublicToken } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({
      bucket: `invite_account_status_${data.kind}`,
      token: data.token,
    });
    if (!guard.allowed) return { account_exists: false, email: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from(INVITE_TABLE[data.kind])
      .select("email")
      .eq("token", data.token)
      .maybeSingle();

    if (!inv?.email) return { account_exists: false, email: null };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", inv.email.trim())
      .maybeSingle();

    return { account_exists: Boolean(profile), email: inv.email };
  });

export type ClaimResult =
  | { ok: true; kind: InviteKind; dest: string; already_linked: boolean }
  | {
      ok: false;
      code:
        | "invalid_token"
        | "expired"
        | "revoked"
        | "email_mismatch"
        | "already_accepted"
        | "unknown";
      message: string;
      /** the invited address, when it is safe to name it (email mismatch) */
      invited_email?: string;
      signed_in_email?: string;
    };

export const claimInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => claimInput.parse(v))
  .handler(async ({ data, context }): Promise<ClaimResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const signedInEmail =
      typeof context.claims.email === "string" ? context.claims.email : "";

    const dest = INVITE_PORTAL_HOME[data.kind];
    const now = new Date().toISOString();
    const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
      (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

    if (data.kind === "admin") {
      const { data: inv } = await supabaseAdmin
        .from("admin_invitations")
        .select("id, email, permission_level, status, expires_at, accepted_user_id")
        .eq("token", data.token)
        .maybeSingle();
      if (!inv) return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
      if (!sameEmail(inv.email, signedInEmail))
        return {
          ok: false,
          code: "email_mismatch",
          message: "This invitation was sent to a different email address.",
          invited_email: inv.email,
          signed_in_email: signedInEmail,
        };
      if (inv.status === "revoked")
        return { ok: false, code: "revoked", message: "This invitation has been withdrawn." };

      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (inv.status === "accepted") {
        if (existingRole) return { ok: true, kind: data.kind, dest, already_linked: true };
        return { ok: false, code: "already_accepted", message: "This invitation has already been used." };
      }
      if (inv.status !== "pending")
        return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
      if (new Date(inv.expires_at).getTime() < Date.now())
        return { ok: false, code: "expired", message: "This invitation has expired." };

      if (!existingRole) {
        const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
          user_id: userId,
          role: "admin",
          permission_level: inv.permission_level,
          is_main_admin: false,
        });
        if (roleErr && !/duplicate|unique/i.test(roleErr.message))
          return { ok: false, code: "unknown", message: roleErr.message };
      }

      await supabaseAdmin
        .from("admin_invitations")
        .update({ status: "accepted", accepted_at: now, accepted_user_id: userId })
        .eq("id", inv.id)
        .eq("status", "pending");

      await supabaseAdmin.from("admin_audit_log").insert({
        actor_id: userId,
        actor_email: inv.email,
        action: "admin_invitation_accepted",
        target_type: "admin_invitation",
        target_id: inv.id,
        target_label: inv.email,
        detail: { permission_level: inv.permission_level, via: "existing_account" },
      });

      return { ok: true, kind: data.kind, dest, already_linked: false };
    }

    if (data.kind === "talent") {
      const { data: inv } = await supabaseAdmin
        .from("talent_invitations")
        .select("id, agency_id, email, status, expires_at")
        .eq("token", data.token)
        .maybeSingle();
      if (!inv) return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
      if (!sameEmail(inv.email, signedInEmail))
        return {
          ok: false,
          code: "email_mismatch",
          message: "This invitation was sent to a different email address.",
          invited_email: inv.email,
          signed_in_email: signedInEmail,
        };
      if (inv.status === "revoked")
        return { ok: false, code: "revoked", message: "This invitation has been withdrawn." };

      const { data: existingLink } = await supabaseAdmin
        .from("agency_talent_links")
        .select("id")
        .eq("talent_invitation_id", inv.id)
        .maybeSingle();

      if (inv.status === "accepted" || existingLink)
        return { ok: true, kind: data.kind, dest, already_linked: true };
      if (inv.status !== "pending")
        return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
      if (new Date(inv.expires_at).getTime() < Date.now())
        return { ok: false, code: "expired", message: "This invitation has expired." };

      const { error: rpcErr } = await supabaseAdmin.rpc("accept_talent_invitation", {
        _invitation_id: inv.id,
        _user_id: userId,
        _email: inv.email,
      });
      if (rpcErr) return { ok: false, code: "unknown", message: rpcErr.message };

      return { ok: true, kind: data.kind, dest, already_linked: false };
    }

    // Agency (owner onboarding or staff)
    const { data: inv } = await supabaseAdmin
      .from("agency_invitations")
      .select("id, agency_id, agency_name, contact_person, email, kind, role, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
    if (!sameEmail(inv.email, signedInEmail))
      return {
        ok: false,
        code: "email_mismatch",
        message: "This invitation was sent to a different email address.",
        invited_email: inv.email,
        signed_in_email: signedInEmail,
      };
    if (inv.status === "revoked")
      return { ok: false, code: "revoked", message: "This invitation has been withdrawn." };

    if (inv.status === "accepted") {
      const { data: member } = await supabaseAdmin
        .from("agency_members")
        .select("id")
        .eq("user_id", userId)
        .eq("agency_id", inv.agency_id ?? "")
        .maybeSingle();
      if (member) return { ok: true, kind: "agency", dest, already_linked: true };
      return { ok: false, code: "already_accepted", message: "This invitation has already been used." };
    }
    if (inv.status !== "pending")
      return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, code: "expired", message: "This invitation has expired." };

    let agencyId = inv.agency_id;
    let memberRole = inv.role ?? "staff";

    if (inv.kind === "agency_onboarding") {
      memberRole = "owner";
      if (!agencyId) {
        const { data: agency, error: agErr } = await supabaseAdmin
          .from("agencies")
          .insert({
            name: inv.agency_name,
            contact_email: inv.email,
            contact_person: inv.contact_person,
            status: "accepted",
            created_by: userId,
          })
          .select("id")
          .single();
        if (agErr || !agency) return { ok: false, code: "unknown", message: agErr?.message ?? "Could not create the workspace." };
        agencyId = agency.id;
        await supabaseAdmin.from("agency_invitations").update({ agency_id: agencyId }).eq("id", inv.id);
      }
    }

    if (!agencyId)
      return { ok: false, code: "invalid_token", message: "This invitation isn't linked to a workspace." };

    const { data: existingMember } = await supabaseAdmin
      .from("agency_members")
      .select("id")
      .eq("user_id", userId)
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (!existingMember) {
      const { error: memErr } = await supabaseAdmin
        .from("agency_members")
        .insert({ agency_id: agencyId, user_id: userId, role: memberRole, suspended: false });
      if (memErr && !/duplicate|unique/i.test(memErr.message))
        return { ok: false, code: "unknown", message: memErr.message };
    }

    await supabaseAdmin
      .from("agency_invitations")
      .update({ status: "accepted", accepted_at: now })
      .eq("id", inv.id)
      .eq("status", "pending");

    return { ok: true, kind: "agency", dest, already_linked: Boolean(existingMember) };
  });
