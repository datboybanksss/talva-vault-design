import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { databaseError } from "./security-errors";
import { deviceKey, deviceLabel } from "./device";

/** Awaited, retry-safe recording; the database validates JWT identity and the existing MFA rule. */
export async function recordCompletedSignIn(supabase: SupabaseClient<Database>, userId: string) {
  const headers = getRequest().headers;
  const ua = headers.get("user-agent");
  const ip =
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  const key = deviceKey(ua),
    label = deviceLabel(ua);
  const { data: past, error: historyError } = await supabase
    .from("talent_audit_log")
    .select("user_agent")
    .eq("actor_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);
  const newDevice =
    !historyError && !!ua && !(past ?? []).some((r) => deviceKey(r.user_agent) === key);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: inserted, error } = await supabase.rpc("record_completed_sign_in", {
      ...(ip ? { _ip: ip } : {}),
      ...(ua ? { _user_agent: ua } : {}),
      _device: label,
      _new_device: newDevice,
    });
    if (error) {
      lastError = error;
      continue;
    }
    if (inserted && newDevice) await notifyNewDevice(userId, label, key, ip);
    return { ok: true, newDevice: inserted && newDevice };
  }
  throw databaseError(lastError, "Your sign-in activity could not be recorded.");
}
async function notifyNewDevice(userId: string, label: string, key: string, ip: string | null) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const when = new Date();
    const { error } = await supabaseAdmin.from("talent_notifications").upsert(
      {
        user_id: userId,
        kind: "new_device_signin",
        dedupe_key: `new_device:${key}:${when.toISOString().slice(0, 10)}`,
        title: `New sign-in from ${label} on ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
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
    if (error) console.error("[new-device notification]", error.code);
  } catch {
    console.error("[new-device notification] unavailable");
  }
}
