import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sendInput = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(8000),
  invite_url: z.string().url(),
});

function fmtExpiry(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Sends the (optionally edited) agency invitation email for real via the
 * Lovable Emails integration. Never throws on a delivery failure — returns a
 * structured result so the admin UI can show an honest status.
 */
export const sendAgencyInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { data: inv, error } = await supabase
      .from("agency_invitations")
      .select("id, email, agency_name, contact_person, expires_at, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found");

    const { buildInvitationEmail } = await import("@/lib/invitation-email");
    const { sendInvitationEmail } = await import("@/lib/invitation-email.server");

    const mail = buildInvitationEmail({
      variant: "agency",
      subject: data.subject,
      body: data.body,
      agencyName: inv.agency_name,
      contactPerson: inv.contact_person,
      recipientEmail: inv.email,
      inviteUrl: data.invite_url,
      expiryDate: fmtExpiry(inv.expires_at),
    });

    const result = await sendInvitationEmail(
      inv.email,
      mail,
      `agency-invite-${inv.id}-${Date.now()}`,
      "agency_invitation",
    );

    await supabase.from("admin_audit_log").insert({
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: result.sent ? "invitation_email_sent" : "invitation_email_send_failed",
      target_type: "agency_invitation",
      target_id: inv.id,
      target_label: inv.email,
      detail: {
        subject: mail.subject,
        edited: true,
        reason: result.sent ? null : result.reason,
      },
    });

    if (result.sent) {
      await supabase
        .from("agency_invitations")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", inv.id);
    }

    return result;
  });

/**
 * Talent invitation email — sent by the owner of the agency that issued the
 * invitation. Mirrors the agency flow exactly, including the honest
 * "not sent" result shape.
 */
export const sendTalentInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;

    const { data: inv, error } = await supabase
      .from("talent_invitations")
      .select("id, agency_id, email, talent_name, expires_at, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found");

    const { data: isOwner, error: roleErr } = await supabase.rpc("has_agency_role", {
      _user_id: userId,
      _agency_id: inv.agency_id,
      _role: "owner",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isOwner) throw new Error("Forbidden: only agency owners may send talent invitations.");

    const { data: agency } = await supabase
      .from("agencies")
      .select("name")
      .eq("id", inv.agency_id)
      .maybeSingle();

    const { buildInvitationEmail } = await import("@/lib/invitation-email");
    const { sendInvitationEmail } = await import("@/lib/invitation-email.server");

    const mail = buildInvitationEmail({
      variant: "talent",
      subject: data.subject,
      body: data.body,
      agencyName: agency?.name ?? "Your Manager",
      talentName: inv.talent_name,
      recipientEmail: inv.email,
      inviteUrl: data.invite_url,
      expiryDate: fmtExpiry(inv.expires_at),
    });

    const result = await sendInvitationEmail(
      inv.email,
      mail,
      `talent-invite-${inv.id}-${Date.now()}`,
      "talent_invitation",
    );

    await supabase.from("agency_audit_log").insert({
      agency_id: inv.agency_id,
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: result.sent
        ? "talent_invitation_email_sent"
        : "talent_invitation_email_send_failed",
      target_type: "talent_invitation",
      target_id: inv.id,
      target_label: inv.email,
      detail: {
        subject: mail.subject,
        reason: result.sent ? null : result.reason,
      },
    });

    if (result.sent) {
      await supabase
        .from("talent_invitations")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", inv.id);
    }

    return result;
  });

/**
 * Administrator invitation email — Main Administrator only.
 */
export const sendAdminInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;

    const { data: role, error: roleErr } = await supabase
      .from("user_roles")
      .select("is_main_admin")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role?.is_main_admin) throw new Error("Forbidden: Main Administrator only");

    const { data: inv, error } = await supabase
      .from("admin_invitations")
      .select("id, email, permission_level, expires_at, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found");

    const { buildInvitationEmail } = await import("@/lib/invitation-email");
    const { sendInvitationEmail } = await import("@/lib/invitation-email.server");

    const mail = buildInvitationEmail({
      variant: "admin",
      subject: data.subject,
      body: data.body,
      permissionLevel: inv.permission_level,
      recipientEmail: inv.email,
      inviteUrl: data.invite_url,
      expiryDate: fmtExpiry(inv.expires_at),
    });

    const result = await sendInvitationEmail(
      inv.email,
      mail,
      `admin-invite-${inv.id}-${Date.now()}`,
      "admin_invitation",
    );

    await supabase.from("admin_audit_log").insert({
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: result.sent
        ? "admin_invitation_email_sent"
        : "admin_invitation_email_send_failed",
      target_type: "admin_invitation",
      target_id: inv.id,
      target_label: inv.email,
      detail: {
        subject: mail.subject,
        permission_level: inv.permission_level,
        reason: result.sent ? null : result.reason,
      },
    });

    if (result.sent) {
      await supabase
        .from("admin_invitations")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", inv.id);
    }

    return result;
  });
