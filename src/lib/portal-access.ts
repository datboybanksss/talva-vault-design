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

export type AccessResult = "granted" | "denied" | "signed-out" | "error" | "paused";

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

/** One server answer: paused status and which portals this account may open. */
export type PortalAccess = {
  userId: string;
  paused: boolean;
  admin: boolean;
  agency: boolean;
  talent: boolean;
  home: string | null;
};

/** How long a sign-in's access answer is reused by the portal gate. */
export const ACCESS_CACHE_MS = 60_000;

// In memory only: a fresh page load always starts empty, so it re-checks.
let cached: { access: PortalAccess; at: number } | null = null;

export function cachePortalAccess(access: PortalAccess, now = Date.now()) {
  cached = { access, at: now };
}
export function clearPortalAccessCache() {
  cached = null;
}
/** The cached answer for this user, if it is younger than ACCESS_CACHE_MS. */
export function cachedPortalAccess(userId: string, now = Date.now()): PortalAccess | null {
  if (!cached || cached.access.userId !== userId) return null;
  if (now - cached.at > ACCESS_CACHE_MS || now < cached.at) return null;
  return cached.access;
}

export function parsePortalAccess(raw: unknown, userId: string): PortalAccess | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || r.signed_in !== true || r.user_id !== userId) return null;
  const home =
    typeof r.home === "string" && Object.values(PORTAL_HOME).includes(r.home) ? r.home : null;
  return {
    userId,
    paused: r.paused === true,
    admin: r.admin === true,
    agency: r.agency === true,
    talent: r.talent === true,
    home,
  };
}

/** One round-trip to the database function my_portal_access(); null on failure. */
export async function fetchPortalAccess(userId: string): Promise<PortalAccess | null> {
  const { data, error } = await supabase.rpc("my_portal_access" as never);
  if (error) return null;
  return parsePortalAccess(data, userId);
}

async function accessFor(userId: string, useCache: boolean): Promise<PortalAccess | null> {
  if (useCache) {
    const hit = cachedPortalAccess(userId);
    if (hit) return hit;
  }
  const first = (await fetchPortalAccess(userId)) ?? (await fetchPortalAccess(userId));
  if (first) cachePortalAccess(first);
  return first;
}

export function accessResultFor(key: PortalKey, access: PortalAccess): AccessResult {
  if (access.paused) return "paused";
  return access[key] ? "granted" : "denied";
}

export async function checkPortalAccess(key: PortalKey): Promise<AccessResult> {
  // getSession() resolves once the client has hydrated its session from storage
  // (and refreshed it if needed), so the role check never runs against a
  // half-initialised auth state.
  const { data: sessRes, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) return "error";
  const userId = sessRes.session?.user?.id;
  if (!userId) return "signed-out";
  // A failed check returns "error", never "denied" (one retry inside).
  const access = await accessFor(userId, true);
  if (!access) return "error";
  const result = accessResultFor(key, access);
  if (result === "paused") {
    clearPortalAccessCache();
    await supabase.auth.signOut();
  }
  return result;
}

export const PORTAL_HOME: Record<PortalKey, string> = {
  admin: "/admin",
  agency: "/agency",
  talent: "/talent",
};

/**
 * Where should *this* account land after signing in, when no explicit `next`
 * was requested? Resolved from the account's actual access, never assumed.
 */
export async function resolvePortalHome(): Promise<string | null> {
  const { data: sessRes } = await supabase.auth.getSession();
  const userId = sessRes.session?.user?.id;
  if (!userId) return null;
  return (await accessFor(userId, true))?.home ?? null;
}

/**
 * Called straight after a password (or code) is accepted: one fresh check,
 * cached briefly so the portal gate doesn't repeat it.
 */
export async function accessAfterSignIn(userId: string): Promise<PortalAccess | null> {
  return accessFor(userId, false);
}

/**
 * Nobody picks a portal in TalVault. If someone lands on a workspace their
 * account doesn't belong to, we quietly move them to the one it does — and
 * only fall back to the sign-in screen when the account has no workspace.
 */
export async function resolveDeniedDestination(
  key: PortalKey,
  href: string,
): Promise<{ to: string; search?: Record<string, string> }> {
  const home = await resolvePortalHome();
  if (home && home !== PORTAL_HOME[key]) return { to: home };
  return { to: "/auth", search: { next: href, denied: DENIED_CODE[key] } };
}

export type MfaGate = "ok" | "enrol" | "challenge";

/**
 * Whether two-step sign-in is enforced. The only switch is the database
 * setting `mfa_enforced` (read through mfa_enforced()), which the server gate
 * and the database policies also use, so they can never disagree. A failed
 * read counts as "off" here only; the server and database still enforce.
 */
export async function isMfaEnforced(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("mfa_enforced");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Two-step sign-in state for the current session, resolved server-side from
 * real records:
 *  - "enrol"     → the account has never completed the code step
 *  - "challenge" → enrolled, but this session hasn't entered a code yet
 */
export async function checkMfaGate(): Promise<MfaGate> {
  if (!(await isMfaEnforced())) return "ok";
  try {
    const { getMfaStatus } = await import("@/lib/mfa.functions");
    const status = await getMfaStatus({ data: {} });
    return status.gate;
  } catch {
    // A transient failure must never lock a legitimate user out of the portal.
    return "ok";
  }
}

/**
 * Is the signed-in account paused (talent, or staff of a paused agency)?
 * The rule is the database function account_paused(). A failed check is
 * treated as not paused here; the database and server still refuse access.
 */
export async function isAccountPaused(): Promise<boolean> {
  const { data, error } = await supabase.rpc("my_account_access");
  if (error) return false;
  return !!(data as { paused?: boolean } | null)?.paused;
}
