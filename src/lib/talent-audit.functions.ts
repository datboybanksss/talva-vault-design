import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { databaseError } from "./security-errors";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTalentTermsAccepted } from "@/lib/terms-guard";
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
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | undefined,
  action: string,
  targetLabel?: string,
  detail: { [key: string]: Json | undefined } = {},
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
  if (error) throw databaseError(error);
  return { ok: true };
}

export const logTalentPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    return writeTalentAudit(
      supabase,
      userId,
      claims?.email,
      "password_changed",
      "Account password",
    );
  });

export const logTalentMfaEnrolled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ factor_type: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    return writeTalentAudit(
      supabase,
      userId,
      claims?.email,
      "mfa_enrolled",
      "Two-factor authentication",
      {
        factor_type: data.factor_type,
      },
    );
  });

export const logTalentMfaDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    return writeTalentAudit(
      supabase,
      userId,
      claims?.email,
      "mfa_disabled",
      "Two-factor authentication",
    );
  });

/** Records one server-validated completed sign-in for this real auth session. */
export const logTalentSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { recordCompletedSignIn } = await import("@/lib/completed-sign-in.server");
    return recordCompletedSignIn(context.supabase, context.userId);
  });

export const listTalentAuditLog = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
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
    if (error) throw databaseError(error);
    return rows ?? [];
  });
