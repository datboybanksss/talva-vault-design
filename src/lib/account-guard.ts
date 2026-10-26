import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNT_PAUSED_CODE, ACCOUNT_UNAVAILABLE_MESSAGE } from "@/lib/account-state";

/**
 * Global server-function guard: a paused account (talent, or any staff of a
 * paused agency) can't call any server function. The rule itself is the
 * database function account_paused(), read through my_account_access().
 * Calls without a signed-in user pass through; each function's own auth
 * decides those.
 */
export const blockPausedAccounts = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const header = getRequest()?.headers.get("authorization") ?? "";
    if (header.startsWith("Bearer ")) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (url && key) {
        const token = header.slice(7);
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
        const { data, error } = await sb.rpc("my_account_access" as never);
        if (error) {
          // An invalid or expired token is for the function's own auth to refuse.
          const status = (error as any).status ?? (error as any).code;
          if (!(status === 401 || status === "PGRST301" || /jwt/i.test(error.message))) {
            throw new Error("We couldn't check your account just now. Please try again.");
          }
        } else if ((data as any)?.paused) {
          throw new Error(`${ACCOUNT_PAUSED_CODE}: ${ACCOUNT_UNAVAILABLE_MESSAGE}`);
        }
      }
    }
    return next();
  },
);
