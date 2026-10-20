import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/mfa.functions", () => ({ getMfaStatus: getStatus }));
vi.mock("@/lib/device", () => ({ browserSessionId: () => "test-session" }));

import { checkMfaGate, MFA_ENFORCED } from "./portal-access";

describe("mandatory two-factor sign-in", () => {
  beforeEach(() => getStatus.mockReset());

  it("enforces two-factor sign-in", () => {
    expect(MFA_ENFORCED).toBe(true);
  });

  it("requires an emailed code for an unverified enrolled session", async () => {
    getStatus.mockResolvedValue({ gate: "challenge" });
    expect(await checkMfaGate()).toBe("challenge");
    expect(getStatus).toHaveBeenCalledWith({ data: { device: "test-session" } });
  });

  it("requires enrolment for an account that has not completed two-factor setup", async () => {
    getStatus.mockResolvedValue({ gate: "enrol" });
    expect(await checkMfaGate()).toBe("enrol");
  });
});
