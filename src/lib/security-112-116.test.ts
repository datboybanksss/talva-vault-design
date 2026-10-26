import { describe, expect, it, vi } from "vitest";
import { invitationClaimError } from "./invite-claim-error";

describe("TVA-SEC-113 invitation claim failures", () => {
  it.each([
    { code: "42501", message: "permission denied for user_roles" },
    { code: "P0001", message: "secret trigger detail" },
    { message: "failed insert into agency_members" },
    { message: "failed insert into agencies" },
  ])("logs failure without returning its detail", (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(invitationClaimError(error)).toBe(
      "We couldn't accept this invitation. Please try again or contact your administrator.",
    );
    expect(log).toHaveBeenCalledWith("[invitation-claim] database failure", {
      code: "code" in error ? error.code : undefined,
      message: error.message,
    });
    log.mockRestore();
  });
});

describe("TVA-SEC-112 hosted public signup", () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  it.skipIf(!url || !key)("refuses public email signup with signup disabled", async () => {
    if (!url || !key) throw new Error("Hosted test configuration unavailable");
    const headers = { apikey: key, "Content-Type": "application/json" };
    const settings = await fetch(`${url}/auth/v1/settings`, { headers }).then((r) => r.json());
    expect(settings.disable_signup).toBe(true);
    const result = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: `qa.signup-denied.${crypto.randomUUID()}@example.com`,
        password: crypto.randomUUID() + "Aa9!",
      }),
    });
    expect(result.status).toBe(422);
    expect((await result.json()).error_code).toBe("signup_disabled");
  });
});

describe("TVA-SEC-114 hosted anonymous function access", () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  it.skipIf(!url || !key)("refuses anonymous account state and overdue sweep calls", async () => {
    if (!url || !key) throw new Error("Hosted test configuration unavailable");
    for (const [name, body] of [
      ["account_paused", { _user_id: "1bd113ae-729a-4367-b83d-405b76f9e1c5" }],
      ["sweep_overdue_invoices", {}],
    ] as const) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect([401, 403]).toContain(response.status);
      expect((await response.json()).code).toBe("42501");
    }
  });
});
