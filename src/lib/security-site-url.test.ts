import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("TVA-SEC-110 refuses missing configuration instead of using a preview URL", async () => {
  vi.stubEnv("PUBLIC_SITE_URL", ""); vi.resetModules();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { requirePublicSiteUrl, PUBLIC_SITE_URL } = await import("./brand-email");
  expect(PUBLIC_SITE_URL).toBe("");
  expect(() => requirePublicSiteUrl()).toThrow("We couldn't send this share email.");
  expect(log).toHaveBeenCalled(); log.mockRestore();
});
it("TVA-SEC-110 uses only the explicitly configured HTTPS site", async () => {
  vi.stubEnv("PUBLIC_SITE_URL", "https://example.test/"); vi.resetModules();
  const { requirePublicSiteUrl } = await import("./brand-email");
  expect(requirePublicSiteUrl()).toBe("https://example.test");
});