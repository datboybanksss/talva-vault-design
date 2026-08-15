import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends the (optionally edited) agency invitation email for real via the
 * Lovable Emails integration. Never throws on a delivery failure — returns a
 * structured result so the admin UI can show an honest status.
 */
export const sendAgencyInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(8000),
        invite_url: z.string().url(),
      })
      .parse(d),
  )
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

    const { buildInvitationEmail, sendInvitationEmail } = await import(
      "@/lib/invitation-email.server"
    );

    const mail = buildInvitationEmail({
      subject: data.subject,
      body: data.body,
      agencyName: inv.agency_name,
      contactPerson: inv.contact_person,
      recipientEmail: inv.email,
      inviteUrl: data.invite_url,
      expiryDate: new Date(inv.expires_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    });

    const result = await sendInvitationEmail(inv.email, mail);

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
