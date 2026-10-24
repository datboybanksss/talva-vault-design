import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { isMfaBootstrap, isMfaRequired, MFA_REQUIRED } from "./mfa-policy";

/** Every bearer-authenticated RPC fails closed before its handler can use service privileges. */
export const requireMfaVerified = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (typeof window !== "undefined" && isMfaRequired(error)) {
        const path = window.location.pathname;
        if (path !== "/enroll-2fa" && path !== "/auth") {
          const nextPath = `${path}${window.location.search}`;
          window.location.replace(`/enroll-2fa?next=${encodeURIComponent(nextPath)}`);
        }
      }
      throw error;
    }
  })
  .server(async ({ next, serverFnMeta }) => {
    const header = getRequest()?.headers.get("authorization");
    if (!header || isMfaBootstrap(serverFnMeta)) return next();
    if (!header.startsWith("Bearer ")) throw new Error(MFA_REQUIRED);
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error(MFA_REQUIRED);
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("apikey", key);
          headers.set("Authorization", header);
          return fetch(input, { ...init, headers });
        },
      },
    });
    // Auth/Data API verifies the JWT; the SQL function uses only auth.uid()/auth.jwt().
    const { data, error } = await sb.rpc("mfa_session_ok");
    if (error || data !== true) {
      if (error) console.error("MFA session check failed", { code: error.code });
      throw new Error(MFA_REQUIRED);
    }
    return next();
  });