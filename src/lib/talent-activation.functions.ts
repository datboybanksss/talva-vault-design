import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { validateNewPassword } from "@/lib/password";

// Public server functions used by the /invite/talent/$token Talent Activation
// wizard. No auth middleware — the caller is unauthenticated. Access is gated
// by the invitation token itself; the service-role client loads inside handlers.

const resolveInput = z.object({ token: z.string().min(10).max(200) });

export type ResolvedTalentInvitation =
  | {
      ok: true;
      agency_name: string;
      email: string;
      talent_name: string | null;
      expires_at: string;
    }
  | { ok: false; reason: "not_found" | "expired" | "accepted" | "revoked" | "throttled" };

export const resolveTalentInvitationToken = createServerFn({ method: "POST" })
  .inputValidator((v) => resolveInput.parse(v))
  .handler(async ({ data }): Promise<ResolvedTalentInvitation> => {
    const { guardPublicToken } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({ bucket: "invite_resolve_talent", token: data.token });
    if (!guard.allowed) return { ok: false, reason: "throttled" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("talent_invitations")
      .select("agency_id, talent_name, email, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!inv) return { ok: false, reason: "not_found" };
    if (inv.status === "accepted") return { ok: false, reason: "accepted" };
    if (inv.status === "revoked") return { ok: false, reason: "revoked" };
    if (inv.status !== "pending") return { ok: false, reason: "not_found" };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, reason: "expired" };

    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("name")
      .eq("id", inv.agency_id)
      .maybeSingle();

    return {
      ok: true,
      agency_name: agency?.name ?? "your Talent Manager",
      email: inv.email,
      talent_name: inv.talent_name,
      expires_at: inv.expires_at,
    };
  });

const activateInput = z.object({
  token: z.string().min(10).max(200),
  email: z.string().email().max(255),
  full_name: z.string().trim().min(2).max(120),
  id_number: z.string().trim().max(40).optional().or(z.literal("")),
  date_of_birth: z.string().trim().max(20).optional().or(z.literal("")),
  tax_number: z.string().trim().max(40).optional().or(z.literal("")),
  is_provisional_taxpayer: z.boolean().optional(),
  phone_number: z.string().trim().max(40).optional().or(z.literal("")),
  password: z.string().min(12).max(200),
  terms_accepted: z.literal(true),
});

export type TalentActivationResult =
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

export const activateTalentInvitation = createServerFn({ method: "POST" })
  .inputValidator((v) => activateInput.parse(v))
  .handler(async ({ data }): Promise<TalentActivationResult> => {
    const { guardPublicToken, throttleMessage } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({
      bucket: "invite_activate_talent",
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
      .from("talent_invitations")
      .select("id, agency_id, email, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (invErr || !inv)
      return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
    if (inv.status === "accepted")
      return { ok: false, code: "already_accepted", message: "This invitation has already been accepted. Please sign in instead." };
    if (inv.status === "revoked")
      return { ok: false, code: "revoked", message: "This invitation has been revoked. Contact your Manager for a new one." };
    if (inv.status !== "pending")
      return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, code: "expired", message: "This invitation has expired. Contact your Manager for a fresh invite." };
    if (data.email.trim().toLowerCase() !== inv.email.trim().toLowerCase())
      return { ok: false, code: "email_mismatch", message: "Email must match the address the invitation was sent to." };

    // handle_new_user() -> accept_talent_invitation() provisions the talent
    // profile, the agency_talent_links row, the shared folders and marks the
    // invitation accepted.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.full_name },
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
    const nz = (v?: string) => (v && v.trim().length > 0 ? v.trim() : null);

    await supabaseAdmin
      .from("talent_profiles")
      .update({
        full_name: data.full_name,
        id_number: nz(data.id_number),
        date_of_birth: nz(data.date_of_birth),
        tax_number: nz(data.tax_number),
        is_provisional_taxpayer: data.is_provisional_taxpayer ?? false,
        phone_number: nz(data.phone_number),
        activation_completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.full_name,
        phone: nz(data.phone_number),
        terms_accepted_at: new Date().toISOString(),
      })
      .eq("id", userId);

    // Belt-and-braces alongside the trigger.
    await supabaseAdmin
      .from("talent_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.id)
      .eq("status", "pending");

    const { clearTokenGuard } = await import("@/lib/rate-limit.server");
    await clearTokenGuard("invite_activate_talent", data.token);
    return { ok: true, email: inv.email };
  });
