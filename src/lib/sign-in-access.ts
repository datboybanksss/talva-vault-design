import type { PortalAccess } from "./portal-access";

/** A failed access lookup must discard the password session before navigation. */
export async function requireSignInAccess(
  access: PortalAccess | null,
  discardSession: () => Promise<void>,
): Promise<PortalAccess> {
  if (access) return access;
  await discardSession();
  throw new Error("We couldn't sign you in. Please try again.");
}