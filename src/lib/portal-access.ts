import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for "does the currently signed-in account have access
 * to this portal?".
 *
 * Both the route gates (`/admin`, `/agency`, `/talent`) and the sign-in screen
 * use this, so the `denied=...` banner can never disagree with the gate that
 * produced it. Crucially it distinguishes a *settled* denial from a transient
 * failure (network blip, token refresh in flight, RLS hiccup): a failed check
 * returns "error", never "denied", so we never accuse a legitimate admin of
 * lacking access because one RPC did not come back.
 */
export type PortalKey = "admin" | "agency" | "talent";

export type AccessResult = "granted" | "denied" | "signed-out" | "error";

export const DENIED_CODE: Record<PortalKey, string> = {
  admin: "not_admin",
  agency: "not_agency",
  talent: "not_talent",
};

export const PORTAL_FOR_DENIED_CODE: Record<string, PortalKey> = {
  not_admin: "admin",
  not_agency: "agency",
  not_talent: "talent",
};

async function runCheck(key: PortalKey, userId: string): Promise<AccessResult> {
  if (key === "admin") {
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) return "error";
    return data ? "granted" : "denied";
  }

  if (key === "agency") {
    const { data, error } = await supabase
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", userId)
      .eq("suspended", false)
      .limit(1)
      .maybeSingle();
    if (error) return "error";
    return data ? "granted" : "denied";
  }

  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "error";
  return data ? "granted" : "denied";
}

export async function checkPortalAccess(key: PortalKey): Promise<AccessResult> {
  // getSession() resolves once the client has hydrated its session from storage
  // (and refreshed it if needed), so the role check never runs against a
  // half-initialised auth state. It also reports "no session" without the
  // AuthSessionMissingError that getUser() throws when signed out.
  const { data: sessRes, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) return "error";
  const userId = sessRes.session?.user?.id;
  if (!userId) return "signed-out";

  const first = await runCheck(key, userId);
  if (first !== "error") return first;
  // One retry: a single failed round-trip must not turn into a false denial.
  return runCheck(key, userId);
}

export const PORTAL_HOME: Record<PortalKey, string> = {
  admin: "/admin",
  agency: "/agency",
  talent: "/talent",
};

/**
 * Where should *this* account land after signing in, when no explicit `next`
 * was requested? Resolved from the account's actual access, never assumed.
 *
 * Assuming "/admin" for everyone is what produced the phantom denial banner:
 * a non-admin signing in was auto-sent to /admin, the admin gate settled a
 * genuine denial, and bounced them back to /auth?denied=not_admin — a denial
 * the user never asked for and could not clear by navigating to /auth again.
 */
export async function resolvePortalHome(): Promise<string | null> {
  const { data: sessRes } = await supabase.auth.getSession();
  const userId = sessRes.session?.user?.id;
  if (!userId) return null;
  for (const key of ["admin", "agency", "talent"] as PortalKey[]) {
    if ((await runCheck(key, userId)) === "granted") return PORTAL_HOME[key];
  }
  return null;
}

export type MfaGate = "ok" | "enrol" | "challenge";

/**
 * Two-factor authentication is mandatory for every account on every portal.
 * Returns what the gate must do before letting the user in:
 *  - "enrol"     → no verified TOTP factor yet
 *  - "challenge" → factor exists but this session is still AAL1
 */
export async function checkMfaGate(): Promise<MfaGate> {
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) return "ok"; // transient failure must not lock anyone out
  const all = ((factors as unknown as { all?: { factor_type: string; status: string }[] })?.all) ?? [];
  const verified =
    (factors?.totp ?? []).some((f) => f.status === "verified") ||
    all.some((f) => f.factor_type === "totp" && f.status === "verified");
  if (!verified) return "enrol";
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") return "challenge";
  return "ok";
}
