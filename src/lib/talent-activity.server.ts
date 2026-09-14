import { getRequest } from "@tanstack/react-start/server";

/**
 * Canonical talent activity actions written to `talent_audit_log`.
 *
 * Reporting treats every action in ACTIVE_ACTIONS as "touched the vault".
 * Sign-ins are recorded separately so the north star metric can require both
 * a sign-in and a vault action within the same period.
 */
export const TALENT_LOGIN_ACTION = "login";

export const TALENT_VAULT_ACTIONS = [
  "vault_document_uploaded",
  "vault_document_moved",
  "vault_document_deleted",
  "vault_folder_created",
  "vault_document_shared",
] as const;

export type TalentVaultAction = (typeof TALENT_VAULT_ACTIONS)[number];

function requestMeta(): { ip_address: string | null; user_agent: string | null } {
  try {
    const h = getRequest()?.headers;
    if (!h) return { ip_address: null, user_agent: null };
    const ip =
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
      null;
    return { ip_address: ip || null, user_agent: h.get("user-agent") || null };
  } catch {
    return { ip_address: null, user_agent: null };
  }
}

/**
 * Writes one talent activity entry. Logging must never break the action it
 * describes, so failures are swallowed rather than surfaced to the caller.
 */
export async function recordTalentActivity(
  supabase: any,
  userId: string,
  email: string | undefined | null,
  action: string,
  opts: {
    targetType?: string;
    targetId?: string | null;
    targetLabel?: string | null;
    detail?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await supabase.from("talent_audit_log").insert({
      actor_id: userId,
      actor_email: email ?? null,
      action,
      target_type: opts.targetType ?? "vault",
      target_id: opts.targetId ?? null,
      target_label: opts.targetLabel ?? null,
      detail: opts.detail ?? {},
      ...requestMeta(),
    });
  } catch {
    /* activity logging is best-effort */
  }
}
