import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  ACCESS_CACHE_MS,
  accessResultFor,
  cachePortalAccess,
  cachedPortalAccess,
  clearPortalAccessCache,
  parsePortalAccess,
} from "./portal-access";

const uid = "11111111-1111-4111-8111-111111111111";
const base = {
  userId: uid,
  paused: false,
  admin: false,
  agency: true,
  talent: false,
  home: "/agency",
};

describe("sign-in access answer", () => {
  it("is reused for 60 seconds for the same user only", () => {
    expect(ACCESS_CACHE_MS).toBe(60_000);
    cachePortalAccess(base, 1_000);
    expect(cachedPortalAccess(uid, 1_000 + 59_000)).toEqual(base);
    expect(cachedPortalAccess(uid, 1_000 + 61_000)).toBeNull();
    expect(cachedPortalAccess("22222222-2222-4222-8222-222222222222", 2_000)).toBeNull();
    clearPortalAccessCache();
    expect(cachedPortalAccess(uid, 2_000)).toBeNull();
  });

  it("a paused account is refused every portal, even one it belongs to", () => {
    expect(accessResultFor("agency", { ...base, paused: true })).toBe("paused");
  });

  it("an account is only granted the portals it belongs to", () => {
    expect(accessResultFor("agency", base)).toBe("granted");
    expect(accessResultFor("admin", base)).toBe("denied");
    expect(accessResultFor("talent", base)).toBe("denied");
  });

  it("ignores an answer for a different user or an unknown home", () => {
    expect(parsePortalAccess({ signed_in: true, user_id: "x", agency: true }, uid)).toBeNull();
    expect(
      parsePortalAccess({ signed_in: true, user_id: uid, home: "https://evil.example" }, uid)?.home,
    ).toBeNull();
  });
});
