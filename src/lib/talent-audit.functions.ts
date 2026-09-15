import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function extractRequestMeta(): { ip_address: string | null; user_agent: string | null } {
  try {
    const h = getRequest()?.headers;
    if (!h) return { ip_address: null, user_agent: null };
    const ip =
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      null;
    return { ip_address: ip || null, user_agent: h.get("user-agent") || null };
  } catch {
    return { ip_address: null, user_agent: null };
  }
}

/** Writes a talent security-log entry. Never store passwords or 2FA secrets. */
async function writeTalentAudit(
  supabase: any,
  userId: string,
  email: string | undefined,
  action: string,
  targetLabel?: string,
  detail: Record<string, unknown> = {},
) {
  const meta = extractRequestMeta();
  const { error } = await supabase.from("talent_audit_log").insert({
    actor_id: userId,
    actor_email: email ?? null,
    action,
    target_type: "account",
    target_id: userId,
    target_label: targetLabel ?? null,
    detail,
    ...meta,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export const logTalentPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    return writeTalentAudit(supabase, userId, claims?.email, "password_changed", "Account password");
  });

export const logTalentMfaEnrolled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ factor_type: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    return writeTalentAudit(supabase, userId, claims?.email, "mfa_enrolled", "Two-factor authentication", {
      factor_type: data.factor_type,
    });
  });

export const logTalentMfaDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    return writeTalentAudit(supabase, userId, claims?.email, "mfa_disabled", "Two-factor authentication");
  });

/**
 * Records a successful sign-in. Called from the sign-in screen for every
 * account; reporting only counts actors that are linked talent.
 */
export const logTalentSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any;
    const { recordTalentActivity, TALENT_LOGIN_ACTION } = await import(
      "@/lib/talent-activity.server"
    );
    const meta = extractRequestMeta();
    const { deviceLabel, deviceKey } = await import("@/lib/device");
    const label = deviceLabel(meta.user_agent);
    const key = deviceKey(meta.user_agent);

    // Known-device check must run before the new entry is written.
    let isNewDevice = false;
    try {
      const { data: past } = await supabase
        .from("talent_audit_log")
        .select("user_agent")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(300);
      isNewDevice =
        !!meta.user_agent && !(past ?? []).some((r: any) => deviceKey(r.user_agent) === key);
    } catch {
      /* detection is best-effort */
    }

    await recordTalentActivity(supabase, userId, claims?.email, TALENT_LOGIN_ACTION, {
      targetType: "account",
      targetId: userId,
      targetLabel: "Signed in",
      detail: { device: label, new_device: isNewDevice },
    });

    if (isNewDevice) {
      await notifyNewDevice(userId, label, key, meta.ip_address);
    }
    return { ok: true, newDevice: isNewDevice };
  });

/**
 * Surfaces a new-device sign-in through the same reminder channel as expiry
 * warnings, so it reaches the bell and dashboard rather than sitting unseen in
 * the security log. Talents cannot insert notifications themselves, so this
 * runs through the privileged client after the caller has been authenticated.
 */
async function notifyNewDevice(
  userId: string,
  label: string,
  key: string,
  ip: string | null,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const when = new Date();
    await supabaseAdmin.from("talent_notifications").upsert(
      {
        user_id: userId,
        kind: "new_device_signin",
        dedupe_key: `new_device:${key}:${when.toISOString().slice(0, 10)}`,
        title: `New sign-in from ${label} on ${when.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`,
        detail: ip
          ? `If this wasn't you, change your password in Settings → Account. IP ${ip}.`
          : "If this wasn't you, change your password in Settings → Account.",
        tone: "amber",
        target_type: "account",
        target_id: userId,
        due_at: when.toISOString(),
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  } catch {
    /* alerting is best-effort — never block a sign-in */
  }
}

export const listTalentAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("talent_audit_log")
      .select("id, action, actor_email, target_label, detail, ip_address, user_agent, created_at")
      .eq("actor_id", userId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
