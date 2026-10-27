import { createStart, createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { blockPausedAccounts } from "@/lib/account-guard";
import { requireMfaSession } from "@/lib/mfa-gate";

import { renderErrorPage } from "./lib/error-page";
import { publicFunctionError } from "./lib/public-function-error";

const functionErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    const result = await next();
    if ("error" in result && result.error) {
      console.error("[server function]", result.error);
      return { ...result, error: publicFunctionError(result.error) };
    }
    return result;
  } catch (error) {
    console.error("[server function]", error);
    throw publicFunctionError(error);
  }
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [
    functionErrorMiddleware,
    attachSupabaseAuth,
    blockPausedAccounts,
    requireMfaSession,
  ],
}));
