import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Two-step sign-in with an emailed one-time code.
 *
 * Deliberately not Supabase's TOTP: the second factor is a short numeric code
 * sent to the address already verified on the account, so nobody has to install
 * an authenticator app. Codes are stored hashed, expire, are single use and are
 * rate limited on both the account and the caller IP.
 */

export type MfaGateState = "enrol" | "challenge" | "ok";

export type MfaStatus = {
  enrolled: boolean;
  explainerSeen: boolean;
  sessionVerified: boolean;
  gate: MfaGateState;
  email: string | null;
};

/**
 * Which "session" a verification belongs to. Supabase access tokens do not
 * always carry a session id, so the browser supplies its own stable id and the
 * marker is cleared at the start of every password sign-in. That gives exactly
 * one code per sign-in, without re-prompting on every page load.
 */
const deviceInput = z.object({ device: z.string().trim().min(1).max(100) });

/** A verification never outlives the day it was made. */
const VERIFICATION_TTL_HOURS = 12;

/** Current two-step state for the signed-in account and this session. */
export const getMfaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deviceInput.parse(d))
  .handler(async ({ data, context }): Promise<MfaStatus> => {
    const { userId, claims } = context as {
      userId: string;
      claims: Record<string, unknown>;
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("mfa_settings")
      .select("enrolled_at, explainer_seen_at")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: verified } = await supabaseAdmin
      .from("mfa_verified_sessions")
      .select("verified_at")
      .eq("user_id", userId)
      .eq("session_id", data.device)
      .maybeSingle();
    const sessionVerified =
      !!verified &&
      Date.now() - new Date(verified.verified_at).getTime() <
        VERIFICATION_TTL_HOURS * 3_600_000;

    const enrolled = !!settings?.enrolled_at;
    const gate: MfaGateState = !enrolled ? "enrol" : sessionVerified ? "ok" : "challenge";

    return {
      enrolled,
      explainerSeen: !!settings?.explainer_seen_at,
      sessionVerified,
      gate,
      email: typeof claims["email"] === "string" ? (claims["email"] as string) : null,
    };
  });

/** Records that the first-time explainer has been read, so it never reappears. */
export const markMfaExplainerSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("mfa_settings")
      .upsert(
        { user_id: userId, channel: "email", explainer_seen_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return { ok: true as const };
  });

export type SendCodeResult = {
  ok: boolean;
  /** Masked address the code went to, for the "we've sent it to…" line. */
  destination: string | null;
  message: string;
};

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : "";
  return `${head}${"•".repeat(Math.max(2, name.length - 2))}${tail}@${domain}`;
}

/** Issues a fresh code and emails it to the account's own address. */
export const requestSignInCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SendCodeResult> => {
    const { userId, claims } = context as {
      userId: string;
      claims: Record<string, unknown>;
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callerIp, throttleMessage } = await import("@/lib/rate-limit.server");
    const { generateCode, hashCode, buildSignInCodeEmail, CODE_TTL_MINUTES } = await import(
      "@/lib/mfa.server"
    );

    const email =
      (typeof claims["email"] === "string" ? (claims["email"] as string) : null) ??
      (
        await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle()
      ).data?.email ??
      null;

    if (!email) {
      return {
        ok: false,
        destination: null,
        message: "We don't have an email address on file for this account.",
      };
    }

    // Per account, then per caller IP — neither a single account nor a single
    // machine can be used to spam codes.
    for (const guard of [
      { bucket: "mfa_code_send:user", subject: userId, max: 5, window: 900, block: 900 },
      { bucket: "mfa_code_send:ip", subject: callerIp(), max: 20, window: 900, block: 900 },
    ]) {
      const { data } = await supabaseAdmin.rpc("consume_rate_limit", {
        _bucket: guard.bucket,
        _subject: guard.subject,
        _max_attempts: guard.max,
        _window_seconds: guard.window,
        _block_seconds: guard.block,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.allowed === false) {
        return {
          ok: false,
          destination: maskEmail(email),
          message: throttleMessage({
            allowed: false,
            remaining: 0,
            retryAfterSeconds: row.retry_after_seconds ?? 600,
          }),
        };
      }
    }

    // Any earlier code is void the moment a new one is issued.
    await supabaseAdmin
      .from("mfa_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("consumed_at", null);

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    const { error: insErr } = await supabaseAdmin.from("mfa_codes").insert({
      user_id: userId,
      channel: "email",
      destination: email,
      code_hash: hashCode(userId, code),
      expires_at: expiresAt,
    });
    if (insErr) {
      return {
        ok: false,
        destination: maskEmail(email),
        message: "We couldn't create a sign-in code just now. Please try again.",
      };
    }

    const { sendInvitationEmail } = await import("@/lib/invitation-email.server");
    const mail = buildSignInCodeEmail(code);
    const result = await sendInvitationEmail(
      email,
      mail,
      `signin-code-${userId}-${Date.now()}`,
      "sign_in_code",
    );

    if (!result.sent) {
      return {
        ok: false,
        destination: maskEmail(email),
        message:
          result.reason === "domain_unverified"
            ? "We couldn't send the code — our email sending domain is still being verified. Please contact TalVault support."
            : "We couldn't send the code just now. Please try again in a moment.",
      };
    }

    return {
      ok: true,
      destination: maskEmail(email),
      message: `We've sent a ${6}-digit code to ${maskEmail(email)}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    };
  });

export type VerifyCodeResult = { ok: boolean; message: string };

/** Checks a code, marks the session verified and completes first enrolment. */
export const verifySignInCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    deviceInput.extend({ code: z.string().trim().min(4).max(10) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<VerifyCodeResult> => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callerIp, throttleMessage } = await import("@/lib/rate-limit.server");
    const { codeMatches, MAX_CODE_ATTEMPTS } = await import("@/lib/mfa.server");

    const { data: ipVerdict } = await supabaseAdmin.rpc("consume_rate_limit", {
      _bucket: "mfa_code_verify:ip",
      _subject: callerIp(),
      _max_attempts: 30,
      _window_seconds: 900,
      _block_seconds: 900,
    });
    const ipRow = Array.isArray(ipVerdict) ? ipVerdict[0] : ipVerdict;
    if (ipRow && ipRow.allowed === false) {
      return {
        ok: false,
        message: throttleMessage({
          allowed: false,
          remaining: 0,
          retryAfterSeconds: ipRow.retry_after_seconds ?? 600,
        }),
      };
    }

    const { data: row } = await supabaseAdmin
      .from("mfa_codes")
      .select("id, code_hash, expires_at, attempts")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return { ok: false, message: "That code has already been used. Ask for a new one." };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false, message: "That code has expired. Ask for a new one." };
    }
    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      await supabaseAdmin
        .from("mfa_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);
      return { ok: false, message: "Too many incorrect attempts. Ask for a new code." };
    }

    if (!codeMatches(userId, data.code, row.code_hash)) {
      await supabaseAdmin
        .from("mfa_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      const left = MAX_CODE_ATTEMPTS - (row.attempts + 1);
      return {
        ok: false,
        message:
          left > 0
            ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
            : "Too many incorrect attempts. Ask for a new code.",
      };
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from("mfa_codes").update({ consumed_at: now }).eq("id", row.id);

    await supabaseAdmin
      .from("mfa_verified_sessions")
      .upsert(
        { user_id: userId, session_id: data.device, verified_at: now },
        { onConflict: "user_id,session_id" },
      );

    await supabaseAdmin.from("mfa_settings").upsert(
      {
        user_id: userId,
        channel: "email",
        enrolled_at: now,
        explainer_seen_at: now,
      },
      { onConflict: "user_id" },
    );

    return { ok: true, message: "Verified." };
  });

/**
 * TEMPORARY — TESTING ONLY. REMOVE BEFORE LAUNCH (see @/lib/mfa-bypass).
 *
 * Marks this session verified without a code, so QA can get in while emails
 * cannot be delivered. Refuses outright when the flag is off. None of the real
 * code issuing, hashing, expiry or rate-limiting logic is touched.
 */
export const bypassSignInVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deviceInput.parse(d))
  .handler(async ({ data, context }): Promise<VerifyCodeResult> => {
    const { MFA_CODE_BYPASS_FOR_TESTING } = await import("@/lib/mfa-bypass");
    if (!MFA_CODE_BYPASS_FOR_TESTING) {
      return { ok: false, message: "Enter the code we emailed you." };
    }
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("mfa_verified_sessions")
      .upsert(
        { user_id: userId, session_id: data.device, verified_at: now },
        { onConflict: "user_id,session_id" },
      );
    await supabaseAdmin.from("mfa_settings").upsert(
      { user_id: userId, channel: "email", enrolled_at: now, explainer_seen_at: now },
      { onConflict: "user_id" },
    );
    return { ok: true, message: "Verification skipped (testing only)." };
  });

/**
 * Called immediately after a password is accepted: forgets any earlier
 * verification for this browser so every sign-in asks for a fresh code.
 */
export const beginSignInChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deviceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("mfa_verified_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("session_id", data.device);
    return { ok: true as const };
  });
