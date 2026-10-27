import { afterEach, expect, it, vi } from "vitest";
import {
  emailLogoTealUrl,
  emailWhiteBrandHtml,
  invitePath,
  publicSiteUrl,
  requireInviteLink,
  requirePublicSiteUrl,
  requireSiteLink,
  SITE_LINK_MISSING_MESSAGE,
  siteLinkOrNull,
} from "./brand-email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("TVA-SEC-110 refuses missing configuration instead of using a relative or preview URL", () => {
  vi.stubEnv("PUBLIC_SITE_URL", "");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(publicSiteUrl()).toBeNull();
  expect(() => requirePublicSiteUrl()).toThrow(SITE_LINK_MISSING_MESSAGE);
  expect(() => requireInviteLink("talent", "abc12345")).toThrow(SITE_LINK_MISSING_MESSAGE);
  expect(() => requirePublicSiteUrl("Custom share message.")).toThrow("Custom share message.");
  expect(siteLinkOrNull("/talent")).toBeNull();
  expect(log).toHaveBeenCalled();
});

it.each(["http://example.test", "https://example.test/app", "https://example.test?x=1", "example.test", "/"])(
  "rejects an invalid site setting %s",
  (value) => {
    vi.stubEnv("PUBLIC_SITE_URL", value);
    expect(publicSiteUrl()).toBeNull();
  },
);

it("TVA-SEC-110 builds absolute invite links from the configured HTTPS site", () => {
  vi.stubEnv("PUBLIC_SITE_URL", "https://example.test/");
  expect(requirePublicSiteUrl()).toBe("https://example.test");
  expect(requireInviteLink("talent", "tok123")).toBe("https://example.test/invite/talent/tok123");
  expect(requireInviteLink("agency", "tok123")).toBe("https://example.test/invite/tok123");
  expect(requireInviteLink("admin", "tok123")).toBe("https://example.test/invite/admin/tok123");
  expect(requireSiteLink("talent/requests")).toBe("https://example.test/talent/requests");
  expect(invitePath("talent", "a b")).toBe("/invite/talent/a%20b");
});

it("email images are absolute or left out, never relative", () => {
  vi.stubEnv("PUBLIC_SITE_URL", "");
  expect(emailLogoTealUrl()).toBeNull();
  expect(emailWhiteBrandHtml()).not.toMatch(/<img/);
  vi.stubEnv("PUBLIC_SITE_URL", "https://example.test");
  expect(emailLogoTealUrl()).toMatch(/^https:\/\/example\.test\//);
  for (const m of emailWhiteBrandHtml().matchAll(/src="([^"]+)"/g)) {
    expect(m[1]).toMatch(/^https:\/\/example\.test\//);
  }
});
