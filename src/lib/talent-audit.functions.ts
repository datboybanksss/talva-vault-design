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

export const listTalentAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(25),
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
