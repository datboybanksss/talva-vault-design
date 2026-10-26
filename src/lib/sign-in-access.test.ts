import { expect, it, vi } from "vitest";
import { requireSignInAccess } from "./sign-in-access";

it("discards the local session and refuses navigation when access lookup fails", async () => {
  const discard = vi.fn().mockResolvedValue(undefined);
  await expect(requireSignInAccess(null, discard)).rejects.toThrow("We couldn't sign you in. Please try again.");
  expect(discard).toHaveBeenCalledOnce();
});

it("keeps a successfully checked session", async () => {
  const discard = vi.fn();
  const access = { userId: "user", paused: false, admin: false, agency: true, talent: false, home: "/agency" };
  expect(await requireSignInAccess(access, discard)).toBe(access);
  expect(discard).not.toHaveBeenCalled();
});