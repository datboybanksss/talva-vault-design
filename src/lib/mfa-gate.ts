import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

/** Stable refusal code: the client sends the user to the code screen on it. */
export const MFA_REQUIRED_CODE = "MFA_REQUIRED";
export const MFA_REQUIRED_MESSAGE = "Please enter the sign-in code we emailed you to continue.";

/**
 * The only authenticated server functions an unverified session may call:
 * the code flow itself (status, explainer, request, verify, start of sign-in).
 * Sign-out is handled by the auth service directly, not a server function.
 */
export const MFA_ALLOW_LIST: ReadonlyArray<{ filename: string; name: string }> = [
  { filename: "src/lib/mfa.functions.ts", name: "getMfaStatus" },
  { filename: "src/lib/mfa.functions.ts", name: "markMfaExplainerSeen" },
  { filename: "src/lib/mfa.functions.ts", name: "requestSignInCode" },
  { filename: "src/lib/mfa.functions.ts", name: "verifySignInCode" },
  { filename: "src/lib/mfa.functions.ts", name: "beginSignInChallenge" },
];

export function isMfaAllowListed(meta: { filename?: string; name?: string } | undefined): boolean {
  if (!meta?.filename || !meta.name) return false;
  const file = meta.filename.replace(/\\/g, "/").replace(/^.*?(src\/)/, "$1");
  return MFA_ALLOW_LIST.some((e) => e.filename === file && e.name === meta.name);
}

export type MfaCheck = { ok: boolean } | { authError: true } | { failed: true };

/**
 * Decides one call. `check` asks the database mfa_session_ok() as the caller
 * (true whenever the mfa_enforced switch is off), so server and database
 * apply the very same rule.
 */
export async function decideMfaGate(opts: {
  bearer: string | null;
  meta: { filename?: string; name?: string } | undefined;
  check: (token: string) => Promise<MfaCheck>;
}): Promise<"pass" | "refuse" | "unavailable"> {
  if (!opts.bearer || isMfaAllowListed(opts.meta)) return "pass";
  const res = await opts.check(opts.bearer);
  if ("authError" in res) return "pass"; // the function's own auth refuses bad tokens
  if ("failed" in res) return "unavailable";
  return res.ok ? "pass" : "refuse";
}

async function checkWithDatabase(token: string): Promise<MfaCheck> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { failed: true };
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await sb.rpc("mfa_session_ok");
  if (error) {
    // PostgREST errors carry an HTTP status at runtime that the typings lack.
    const status = (error as { status?: number }).status ?? error.code;
    if (status === 401 || status === "PGRST301" || /jwt/i.test(error.message)) {
      return { authError: true };
    }
    console.error("[mfa gate]", error);
    return { failed: true };
  }
  return { ok: data === true };
}

/** Global server-function gate for two-step sign-in. No role is exempt. */
export const requireMfaSession = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    const header = getRequest()?.headers.get("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
    const verdict = await decideMfaGate({ bearer, meta: serverFnMeta, check: checkWithDatabase });
    if (verdict === "refuse") throw new Error(`${MFA_REQUIRED_CODE}: ${MFA_REQUIRED_MESSAGE}`);
    if (verdict === "unavailable") {
      throw new Error("We couldn't check your sign-in just now. Please try again.");
    }
    return next();
  },
);
