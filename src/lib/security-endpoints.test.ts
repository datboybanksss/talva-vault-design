import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpcError: false, rpcThrows: false, writes: 0, expiry: "2099-01-01T00:00:00Z" }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers({ "x-forwarded-for": "spoofed" }) }) }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async () => {
    if (state.rpcThrows) throw new Error("unavailable");
    return state.rpcError ? { data: null, error: { message: "offline" } } : { data: [{ allowed: true, remaining: 1, retry_after_seconds: 0 }], error: null };
  },
  from: () => {
    let updating = false;
    const query = {
      select: () => query, eq: () => query, gt: () => query,
      update: () => { state.writes++; updating = true; return query; },
      maybeSingle: async () => ({ data: updating ? { id: "agency" } : { id: "agency", name: '<svg onload="attack()">', billing_from_email: '<script>attack()</script>', billing_from_token_expires_at: state.expiry }, error: null }),
    };
    return query;
  },
} }));

import { verifyBillingSenderRequest } from "@/routes/api/public/verify-billing-sender";
import { callerIp, guardPublicToken } from "./rate-limit.server";

beforeEach(() => { state.rpcError = false; state.rpcThrows = false; state.writes = 0; state.expiry = "2099-01-01T00:00:00Z"; });

it("TVA-SEC-105 GET never verifies and escapes stored agency/email values", async () => {
  const response = await verifyBillingSenderRequest(new Request("https://example.test/api/public/verify-billing-sender?token=123456789012345678901234"));
  const html = await response.text();
  expect(state.writes).toBe(0);
  expect(html).not.toContain("<svg");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;svg");
  expect(response.status).toBe(200);
  const csp = response.headers.get("Content-Security-Policy");
  for (const directive of ["default-src 'none'", "style-src 'unsafe-inline'", "form-action 'self'", "base-uri 'none'", "frame-ancestors 'none'"]) {
    expect(csp).toContain(directive);
  }
  expect(csp).not.toContain("script-src 'unsafe-inline'");
});
it("TVA-SEC-105 POST redeems a valid unexpired token", async () => {
  const response = await verifyBillingSenderRequest(new Request("https://example.test/api/public/verify-billing-sender", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=123456789012345678901234" }));
  expect(state.writes).toBe(1);
  expect(response.status).toBe(200);
});
it("TVA-SEC-105 refuses an expired token without writing", async () => {
  state.expiry = "2026-01-01T00:00:00Z";
  const response = await verifyBillingSenderRequest(new Request("https://example.test/api/public/verify-billing-sender", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=123456789012345678901234" }));
  expect(state.writes).toBe(0);
  expect(response.status).toBe(400);
});
it("TVA-SEC-109 limiter errors and exceptions both deny", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  state.rpcError = true;
  expect((await guardPublicToken({ bucket: "invite", token: "token" })).allowed).toBe(false);
  state.rpcError = false; state.rpcThrows = true;
  expect((await guardPublicToken({ bucket: "share", token: "token" })).allowed).toBe(false);
  expect(callerIp()).toBe("unknown");
  log.mockRestore();
});