import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/mfa.functions", () => ({ getMfaStatus: getStatus }));
vi.mock("@/lib/device", () => ({ browserSessionId: () => "test-session" }));

import { checkMfaGate, MFA_ENFORCED } from "./portal-access";

describe("TVA-SEC-101 deferred — live app owns two-factor sign-in", () => {
  beforeEach(() => {
    getStatus.mockReset();
  });

  it("keeps build-level two-factor enforcement off", () => {
    expect(MFA_ENFORCED).toBe(false);
  });

  it("allows password-only access without requesting a code", async () => {
    getStatus.mockResolvedValue({ gate: "challenge" });
    expect(await checkMfaGate()).toBe("ok");
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("does not require enrolment while build-level enforcement is off", async () => {
    getStatus.mockResolvedValue({ gate: "enrol" });
    expect(await checkMfaGate()).toBe("ok");
  });
  it("does not block access on an unavailable code service", async () => {
    getStatus.mockRejectedValue(new Error("offline"));
    expect(await checkMfaGate()).toBe("ok");
    expect(getStatus).not.toHaveBeenCalled();
  });
});
