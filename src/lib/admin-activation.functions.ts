import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { validateNewPassword } from "@/lib/password";

// Public server functions used by the /invite/admin/$token Administrator
// Activation wizard. No auth middleware — the caller is unauthenticated.
// Access is gated by the invitation token itself; the service-role client is
// loaded inside handlers so it never reaches the browser bundle.

const resolveInput = z.object({ token: z.string().min(10).max(200) });

export type ResolvedAdminInvitation =
  | {
      ok: true;
      email: string;
      permission_level: string;
      expires_at: string;
    }
  | { ok: false; reason: "not_found" | "expired" | "accepted" | "revoked" | "throttled" };

export const resolveAdminInvitationToken = createServerFn({ method: "POST" })
  .inputValidator((v) => resolveInput.parse(v))
  .handler(async ({ data }): Promise<ResolvedAdminInvitation> => {
    const { guardPublicToken } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({ bucket: "invite_resolve_admin", token: data.token });
    if (!guard.allowed) return { ok: false, reason: "throttled" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("admin_invitations")
      .select("email, permission_level, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!inv) return { ok: false, reason: "not_found" };
    if (inv.status === "accepted") return { ok: false, reason: "accepted" };
    if (inv.status === "revoked") return { ok: false, reason: "revoked" };
    if (inv.status !== "pending") return { ok: false, reason: "not_found" };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, reason: "expired" };

    return {
      ok: true,
      email: inv.email,
      permission_level: inv.permission_level,
      expires_at: inv.expires_at,
    };
  });

const activateInput = z.object({
  token: z.string().min(10).max(200),
  email: z.string().email().max(255),
  display_name: z.string().trim().min(2).max(120),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  password: z.string().min(12).max(200),
  terms_accepted: z.literal(true),
});

export type AdminActivationResult =
  | { ok: true; email: string }
  | {
      ok: false;
      code:
        | "invalid_token"
        | "expired"
        | "already_accepted"
        | "revoked"
        | "email_mismatch"
        | "weak_password"
        | "account_exists"
        | "throttled"
        | "unknown";
      message: string;
    };

export const activateAdminInvitation = createServerFn({ method: "POST" })
  .inputValidator((v) => activateInput.parse(v))
  .handler(async ({ data }): Promise<AdminActivationResult> => {
    const { guardPublicToken, throttleMessage } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({
      bucket: "invite_activate_admin",
      token: data.token,
      perIp: { max: 10, windowSeconds: 900, blockSeconds: 1800 },
      perToken: { max: 6, windowSeconds: 900, blockSeconds: 1800 },
    });
    if (!guard.allowed)
      return { ok: false, code: "throttled", message: throttleMessage(guard) };

    const pwErr = validateNewPassword(data.password);
    if (pwErr) return { ok: false, code: "weak_password", message: pwErr };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error: invErr } = await supabaseAdmin
      .from("admin_invitations")
      .select("id, email, permission_level, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (invErr || !inv)
      return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
    if (inv.status === "accepted")
      return { ok: false, code: "already_accepted", message: "This invitation has already been accepted. Please sign in instead." };
    if (inv.status === "revoked")
      return { ok: false, code: "revoked", message: "This invitation has been revoked. Contact the Main Administrator for a new one." };
    if (inv.status !== "pending")
      return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, code: "expired", message: "This invitation has expired. Contact the Main Administrator for a fresh invite." };
    if (data.email.trim().toLowerCase() !== inv.email.trim().toLowerCase())
      return { ok: false, code: "email_mismatch", message: "Email must match the address the invitation was sent to." };

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "Could not create your account.";
      if (/already.*registered|already.*exists|duplicate/i.test(msg)) {
        return {
          ok: false,
          code: "account_exists",
          message: "An account already exists for this email. Please sign in instead.",
        };
      }
      return { ok: false, code: "unknown", message: msg };
    }

    const userId = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.display_name,
        designation: data.designation && data.designation.length > 0 ? data.designation : null,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq("id", userId);

    // Grant the administrator role at the invited permission level. Never
    // main admin — that is reserved for the founding account.
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
      permission_level: inv.permission_level,
      is_main_admin: false,
    });
    if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
      return { ok: false, code: "unknown", message: roleErr.message };
    }

    await supabaseAdmin
      .from("admin_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_user_id: userId,
      })
      .eq("id", inv.id)
      .eq("status", "pending");

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: userId,
      actor_email: inv.email,
      action: "admin_invitation_accepted",
      target_type: "admin_invitation",
      target_id: inv.id,
      target_label: inv.email,
      detail: { permission_level: inv.permission_level },
    });

    const { clearTokenGuard } = await import("@/lib/rate-limit.server");
    await clearTokenGuard("invite_activate_admin", data.token);
    return { ok: true, email: inv.email };
  });
