import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { validateNewPassword } from "@/lib/password";

// Public server functions used by the /invite/$token Agency Activation wizard.
// No auth middleware — the caller is unauthenticated. Access is gated by the
// invitation token itself; the service-role client is loaded inside handlers.

const resolveInput = z.object({ token: z.string().min(10).max(200) });

export type ResolvedInvitation =
  | {
      ok: true;
      agency_name: string;
      email: string;
      kind: "agency_onboarding" | "staff";
      contact_person: string | null;
      role: string | null;
      expires_at: string;
    }
  | { ok: false; reason: "not_found" | "expired" | "accepted" | "revoked" | "unsupported" };

export const resolveAgencyInvitationToken = createServerFn({ method: "POST" })
  .inputValidator((v) => resolveInput.parse(v))
  .handler(async ({ data }): Promise<ResolvedInvitation> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("agency_invitations")
      .select("agency_name, email, kind, contact_person, role, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!inv) return { ok: false, reason: "not_found" };
    if (inv.status === "accepted") return { ok: false, reason: "accepted" };
    if (inv.status === "revoked") return { ok: false, reason: "revoked" };
    if (inv.status !== "pending") return { ok: false, reason: "not_found" };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, reason: "expired" };
    if (inv.kind !== "agency_onboarding" && inv.kind !== "staff")
      return { ok: false, reason: "unsupported" };

    return {
      ok: true,
      agency_name: inv.agency_name,
      email: inv.email,
      kind: inv.kind as "agency_onboarding" | "staff",
      contact_person: inv.contact_person,
      role: inv.role,
      expires_at: inv.expires_at,
    };
  });

const activateInput = z.object({
  token: z.string().min(10).max(200),
  email: z.string().email().max(255),
  display_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  password: z.string().min(12).max(200),
  terms_accepted: z.literal(true),
});

export type ActivationResult =
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
        | "unknown";
      message: string;
    };

export const activateAgencyInvitation = createServerFn({ method: "POST" })
  .inputValidator((v) => activateInput.parse(v))
  .handler(async ({ data }): Promise<ActivationResult> => {
    const pwErr = validateNewPassword(data.password);
    if (pwErr) return { ok: false, code: "weak_password", message: pwErr };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error: invErr } = await supabaseAdmin
      .from("agency_invitations")
      .select("id, agency_id, agency_name, email, kind, role, status, expires_at, invited_by")
      .eq("token", data.token)
      .maybeSingle();

    if (invErr || !inv) return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
    if (inv.status === "accepted") return { ok: false, code: "already_accepted", message: "This invitation has already been accepted. Please sign in instead." };
    if (inv.status === "revoked") return { ok: false, code: "revoked", message: "This invitation has been revoked. Contact your administrator for a new one." };
    if (inv.status !== "pending") return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false, code: "expired", message: "This invitation has expired. Contact your administrator for a fresh invite." };
    if (data.email.trim().toLowerCase() !== inv.email.trim().toLowerCase())
      return { ok: false, code: "email_mismatch", message: "Email must match the address the invitation was sent to." };

    // Create the auth user. handle_new_user() trigger will provision profile,
    // agency (for owner onboarding) or membership (for staff) and mark the
    // invitation accepted.
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

    // Populate the additional profile fields the trigger doesn't handle.
    await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.display_name,
        phone: data.phone && data.phone.length > 0 ? data.phone : null,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq("id", created.user.id);

    // Ensure the invite is marked accepted (belt-and-braces alongside the trigger).
    await supabaseAdmin
      .from("agency_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.id)
      .eq("status", "pending");

    return { ok: true, email: inv.email };
  });
