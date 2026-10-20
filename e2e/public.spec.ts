import { expect, test, type Page } from "@playwright/test";

/**
 * Public checks — none of these sign in or write anything to the database.
 * Tokens used below are random strings that can never match a real invitation.
 */

const randomToken = () =>
  `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-invalid`;

/** Collects console errors, ignoring noise from the browser itself. */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("Sign-in page", () => {
  test("loads with the sign-in form and no console errors", async ({ page }) => {
    const errors = watchConsole(page);
    const res = await page.goto("/auth");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/Sign in · TalVault/);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors, `Console errors:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("Signed-out visitors are sent to sign-in", () => {
  const protectedRoutes = [
    { portal: "Admin", path: "/admin" },
    { portal: "Admin", path: "/admin/invitations" },
    { portal: "Talent Manager (agency)", path: "/agency" },
    { portal: "Talent Manager (agency)", path: "/agency/document-vault" },
    { portal: "Talent", path: "/talent" },
    { portal: "Talent", path: "/talent/vault" },
    // Trusted contact sharing is managed from the talent portal.
    { portal: "Trusted contact (sharing settings)", path: "/talent/sharing" },
  ];
  for (const r of protectedRoutes) {
    test(`${r.portal}: ${r.path}`, async ({ page }) => {
      await page.goto(r.path);
      await expect(page).toHaveURL(/\/auth(\?|$)/, { timeout: 30_000 });
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });
  }
});

test.describe("Invalid invitation and share links show a friendly message", () => {
  const links = [
    { name: "Agency invitation", path: () => `/invite/${randomToken()}` },
    { name: "Talent invitation", path: () => `/invite/talent/${randomToken()}` },
    { name: "Administrator invitation", path: () => `/invite/admin/${randomToken()}` },
    { name: "Trusted contact share", path: () => `/loved-one/${randomToken()}` },
  ];
  for (const l of links) {
    test(l.name, async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto(l.path());
      // A clear explanation, not a crash screen.
      await expect(
        page
          .getByText(/not found|no longer valid|expired|invalid|isn't available|unavailable/i)
          .first(),
      ).toBeVisible();
      await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
      expect(errors.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e))).toEqual([]);
    });
  }
});

test.describe("Invitation link format", () => {
  // Links are built as <site>/invite/<token>, <site>/invite/talent/<token>
  // and <site>/invite/admin/<token>. Each pattern must reach its own
  // activation page rather than a "page not found" screen.
  const formats = [
    { pattern: "/invite/<token>", path: "/invite/", eyebrow: /Agency Activation/i },
    { pattern: "/invite/talent/<token>", path: "/invite/talent/", eyebrow: /Talent Activation/i },
    {
      pattern: "/invite/admin/<token>",
      path: "/invite/admin/",
      eyebrow: /Administrator Activation/i,
    },
  ];
  for (const f of formats) {
    test(`${f.pattern} reaches its activation page`, async ({ page }) => {
      const token = randomToken();
      expect(`${f.path}${token}`).toMatch(/^\/invite\/(talent\/|admin\/)?[A-Za-z0-9-]{10,200}$/);
      await page.goto(`${f.path}${token}`);
      await expect(page.getByText(f.eyebrow).first()).toBeVisible();
    });
  }
});

test.describe("Security headers", () => {
  for (const path of ["/", "/auth"]) {
    test(`present on ${path}`, async ({ request }) => {
      const res = await request.get(path);
      const h = res.headers();
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBeTruthy();
      expect(h["permissions-policy"]).toBeTruthy();
      expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    });
  }
});

test.describe("Help icon", () => {
  // The Help icon lives in the signed-in portal topbars only (Admin, agency,
  // Talent). No public page has a topbar, so the public check confirms it is
  // not shown there; the portal check runs once signed-in tests are enabled.
  test("is not shown on public pages, which have no topbar", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: /getting started|help/i })).toHaveCount(0);
  });
});

test.describe("UK spelling on public pages", () => {
  const AMERICAN = [
    "color",
    "colors",
    "colored",
    "center",
    "centers",
    "centered",
    "organization",
    "organizations",
    "organize",
    "organized",
    "analyze",
    "analyzed",
    "catalog",
    "favorite",
    "behavior",
    "honor",
    "license",
    "licenses",
    "realize",
    "recognize",
    "authorize",
    "authorized",
    "advisor",
  ];
  const re = new RegExp(`\\b(${AMERICAN.join("|")})\\b`, "gi");
  const pages = [
    "/",
    "/auth",
    "/forgot-password",
    "/legal/privacy",
    "/legal/terms/talent",
    "/legal/terms/agency",
  ];
  for (const path of pages) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const text = await page.locator("body").innerText();
      const hits = [...new Set((text.match(re) ?? []).map((w) => w.toLowerCase()))];
      expect(hits, `American spellings found on ${path}: ${hits.join(", ")}`).toEqual([]);
    });
  }
});
