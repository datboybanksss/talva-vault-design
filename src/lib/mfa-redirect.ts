import { createMiddleware } from "@tanstack/react-start";

/** True when a server-function failure is the two-step refusal (MFA_REQUIRED). */
export function isMfaRequiredError(error: unknown): boolean {
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof error === "string"
        ? error
        : "";
  return /^MFA_REQUIRED(?::|$)/.test(msg.trim());
}

/** Where the existing code screen lives, returning to the current page afterwards. */
export function mfaCodeScreenUrl(current: { pathname: string; search: string; hash: string }) {
  const next = `${current.pathname}${current.search}${current.hash}`;
  return `/auth?next=${encodeURIComponent(next)}`;
}

function sendToCodeScreen() {
  if (typeof window === "undefined" || window.location.pathname === "/auth") return;
  window.location.assign(mfaCodeScreenUrl(window.location));
}

/** Client side: any MFA_REQUIRED refusal sends the user to the code screen. */
export const redirectOnMfaRequired = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      const result = await next();
      if ("error" in result && isMfaRequiredError(result.error)) sendToCodeScreen();
      return result;
    } catch (error) {
      if (isMfaRequiredError(error)) sendToCodeScreen();
      throw error;
    }
  },
);
