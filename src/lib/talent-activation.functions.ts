import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateNewPassword } from "@/lib/password";
import { adultBirthDate, validBirthDate } from "./talent-registration-core";
import { friendlyError } from "./friendly-error";
import { databaseError } from "./security-errors";

type LoadedInvite = {
  kind: "agency" | "independent";
  id: string;
  agency_id: string | null;
  email: string;
  talent_name: string | null;
  status: string;
  acceptance_unavailable_at: string | null;
  expires_at: string;
};

/** Talent invitation tokens live in two tables: agency invites and admin (independent) invites. */
async function loadTalentInvite(
  supabaseAdmin: SupabaseClient<Database>,
  token: string,
): Promise<LoadedInvite | null> {
  const { data: inv } = await supabaseAdmin
    .from("talent_invitations")
    .select("id, agency_id, talent_name, email, status, expires_at, acceptance_unavailable_at")
    .eq("token", token)
    .maybeSingle();
  if (inv) return { kind: "agency", ...inv };
  const { data: ind } = await supabaseAdmin
    .from("independent_talent_invitations")
    .select("id, talent_name, email, status, expires_at, acceptance_unavailable_at")
    .eq("token", token)
    .maybeSingle();
  if (ind) return { kind: "independent", agency_id: null, ...ind };
  return null;
}

// Public server functions used by the /invite/talent/$token Talent Activation
// wizard. No auth middleware — the caller is unauthenticated. Access is gated
// by the invitation token itself; the service-role client loads inside handlers.

const resolveInput = z.object({ token: z.string().min(10).max(200) });

export type ResolvedTalentInvitation =
  | {
      ok: true;
      /** null for independent talent, or when the agency record is unavailable */
      agency_name: string | null;
      independent: boolean;
      /** an agency's request to connect with someone who already has an account */
      link_request: boolean;
      email: string;
      talent_name: string | null;
      expires_at: string;
    }
  | {
      ok: false;
      reason: "not_found" | "invalid" | "expired" | "accepted" | "revoked" | "throttled" | "unavailable";
    };

export const resolveTalentInvitationToken = createServerFn({ method: "POST" })
  .inputValidator((v) => resolveInput.parse(v))
  .handler(async ({ data }): Promise<ResolvedTalentInvitation> => {
    const { guardPublicToken } = await import("@/lib/rate-limit.server");
    const guard = await guardPublicToken({ bucket: "invite_resolve_talent", token: data.token });
    if (!guard.allowed) return { ok: false, reason: "throttled" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inv = await loadTalentInvite(supabaseAdmin, data.token);

    if (!inv) return { ok: false, reason: "not_found" };
    if (inv.acceptance_unavailable_at) return { ok: false, reason: "unavailable" };
    if (inv.status === "accepted") return { ok: false, reason: "accepted" };
    if (inv.status === "revoked") return { ok: false, reason: "revoked" };
    if (inv.status !== "pending") return { ok: false, reason: "not_found" };
    if (new Date(inv.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

    let agencyName: string | null = null;
    if (inv.agency_id) {
      const { data: agency } = await supabaseAdmin
        .from("agencies")
        .select("name")
        .eq("id", inv.agency_id)
        .maybeSingle();
      agencyName = agency?.name?.trim() || null;
    }

    // Connection requests show the same page as any invitation (the agency can
    // open copied links). Inert invitations can never be accepted.
    if (inv.kind === "agency") {
      const { data: priv } = await supabaseAdmin
        .from("talent_invite_private")
        .select("kind")
        .eq("invitation_id", inv.id)
        .maybeSingle();
      if (priv?.kind === "inert") return { ok: false, reason: "invalid" };
    }
    const linkRequest = false;

    return {
      ok: true,
      agency_name: agencyName,
      independent: inv.kind === "independent",
      link_request: linkRequest,
      email: inv.email,
      talent_name: inv.talent_name,
      expires_at: inv.expires_at,
    };
  });

const activateInput = z.object({
  token: z.string().min(10).max(200),
  email: z.string().email().max(255),
  full_name: z.string().trim().min(2).max(120),
  date_of_birth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter your date of birth."),
  tax_number: z.string().trim().max(40).optional().or(z.literal("")),
  is_provisional_taxpayer: z.boolean().optional(),
  phone_number: z.string().trim().max(40).optional().or(z.literal("")),
  password: z.string().min(12).max(200),
  terms_accepted: z.literal(true),
  terms_document_id: z.string().uuid(),
  terms_body_sha256: z
    .string()
    .max(10000)
    .regex(/^[a-f0-9]{64}$/),
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
        | "under_age"
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
    if (!guard.allowed) return { ok: false, code: "throttled", message: throttleMessage(guard) };

    const pwErr = validateNewPassword(data.password);
    if (pwErr) return { ok: false, code: "weak_password", message: pwErr };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const inv = await loadTalentInvite(supabaseAdmin, data.token);

    if (!inv)
      return { ok: false, code: "invalid_token", message: "This invitation link is invalid." };
    if (inv.kind === "agency") {
      const { data: priv } = await supabaseAdmin
        .from("talent_invite_private")
        .select("kind")
        .eq("invitation_id", inv.id)
        .maybeSingle();
      if (priv?.kind === "inert")
        return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
    }
    if (inv.status === "accepted")
      return {
        ok: false,
        code: "already_accepted",
        message: "This invitation has already been accepted. Please sign in instead.",
      };
    if (inv.status === "revoked")
      return {
        ok: false,
        code: "revoked",
        message:
          "This invitation has been revoked. Contact the person who invited you for a new one.",
      };
    if (inv.status !== "pending")
      return { ok: false, code: "invalid_token", message: "This invitation is no longer valid." };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return {
        ok: false,
        code: "expired",
        message:
          "This invitation has expired. Contact the person who invited you for a fresh invite.",
      };
    if (data.email.trim().toLowerCase() !== inv.email.trim().toLowerCase())
      return {
        ok: false,
        code: "email_mismatch",
        message: `This email doesn't match the one you were invited on — please use ${inv.email}, or contact the person who invited you.`,
      };

    const { registrationCopy } = await import("./registration-copy.server");
    const copy = await registrationCopy();
    if (inv.acceptance_unavailable_at) return { ok: false, code: "unknown", message: copy.account_unavailable };
    if (!validBirthDate(data.date_of_birth)) return { ok: false, code: "unknown", message: copy.birth_date_invalid };
    if (!adultBirthDate(data.date_of_birth)) {
      const { error } = await supabaseAdmin.from(inv.kind === "agency" ? "talent_invitations" : "independent_talent_invitations").update({ acceptance_unavailable_at: new Date().toISOString() }).eq("id", inv.id).eq("status", "pending");
      if (error) throw databaseError(error);
      return { ok: false, code: "under_age", message: copy.account_unavailable };
    }

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
          message:
            "This email is already used for a TalVault account. Please sign in instead, or ask the person who invited you to use another address.",
        };
      }
      console.error("[talent activation] account creation failed", createErr);
      return { ok: false, code: "unknown", message: friendlyError(createErr, "Could not create your account.") };
    }

    const userId = created.user.id;
    const nz = (v?: string) => (v && v.trim().length > 0 ? v.trim() : null);

    // Terms acceptance is recorded first: if it cannot be written, the account
    // is rolled back so no vault is activated without an acceptance record.
    try {
      const { recordLegalAcceptance } = await import("@/lib/legal-acceptance.server");
      // Name first, so the acceptance stamp captures the name just entered.
      await supabaseAdmin
        .from("talent_profiles")
        .update({ full_name: data.full_name })
        .eq("user_id", userId);
      await recordLegalAcceptance({
        userId,
        docType: "talent",
        documentId: data.terms_document_id,
        bodySha256: data.terms_body_sha256,
        method: "activation",
      });
    } catch (e) {
      const errMessage =
        e && typeof e === "object" && "message" in e && typeof e.message === "string"
          ? e.message
          : undefined;
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      return {
        ok: false,
        code: "unknown",
        message:
          friendlyError(errMessage, "We couldn't record your acceptance of the Terms & Conditions. Please try again."),
      };
    }

    await supabaseAdmin
      .from("talent_profiles")
      .update({
        full_name: data.full_name,
        date_of_birth: data.date_of_birth,
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
      .from(inv.kind === "agency" ? "talent_invitations" : "independent_talent_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.id)
      .eq("status", "pending");

    const { clearTokenGuard } = await import("@/lib/rate-limit.server");
    await clearTokenGuard("invite_activate_talent", data.token);
    return { ok: true, email: inv.email };
  });


/** Checks the private birth date before the wizard advances; no entered details are stored. */
export const checkTalentRegistrationEligibility = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ token: z.string().min(10).max(200), date_of_birth: z.string().max(10) }).parse(value))
  .handler(async ({ data }): Promise<{ allowed: boolean; terminal: boolean; message: string }> => {
    const { guardPublicToken } = await import("./rate-limit.server");
    const guard = await guardPublicToken({ bucket: "invite_activate_talent", token: data.token });
    const { registrationCopy } = await import("./registration-copy.server");
    const copy = await registrationCopy();
    if (!guard.allowed) return { allowed: false, terminal: false, message: copy.account_unavailable };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inv = await loadTalentInvite(supabaseAdmin, data.token);
    if (!inv || inv.status !== "pending" || new Date(inv.expires_at).getTime() < Date.now() || inv.acceptance_unavailable_at) return { allowed: false, terminal: true, message: copy.account_unavailable };
    if (!validBirthDate(data.date_of_birth)) return { allowed: false, terminal: false, message: copy.birth_date_invalid };
    if (adultBirthDate(data.date_of_birth)) return { allowed: true, terminal: false, message: "" };
    const { error } = await supabaseAdmin.from(inv.kind === "agency" ? "talent_invitations" : "independent_talent_invitations").update({ acceptance_unavailable_at: new Date().toISOString() }).eq("id", inv.id).eq("status", "pending");
    if (error) throw databaseError(error);
    return { allowed: false, terminal: true, message: copy.account_unavailable };
  });
