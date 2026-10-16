import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end test configuration.
 *
 * E2E_BASE_URL chooses the site under test. When it is not set, Playwright
 * starts the app locally (the same code as the Lovable preview) and tests that,
 * so the suite never points at the live site by default.
 */
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const localBaseUrl = "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "bun run dev --port 8080 --strictPort",
        url: localBaseUrl,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
