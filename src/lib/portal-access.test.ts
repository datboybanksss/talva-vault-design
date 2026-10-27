import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStatus, rpc } = vi.hoisted(() => ({ getStatus: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/mfa.functions", () => ({ getMfaStatus: getStatus }));

import { checkMfaGate, isMfaEnforced } from "./portal-access";

describe("two-step gate follows the database switch mfa_enforced", () => {
  beforeEach(() => {
    getStatus.mockReset();
    rpc.mockReset();
  });

  it("OFF: password-only access without requesting a code", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    getStatus.mockResolvedValue({ gate: "challenge" });
    expect(await isMfaEnforced()).toBe(false);
    expect(await checkMfaGate()).toBe("ok");
    expect(getStatus).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("mfa_enforced");
  });

  it("ON: an unverified session is sent to the code screen", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    getStatus.mockResolvedValue({ gate: "challenge" });
    expect(await checkMfaGate()).toBe("challenge");
  });

  it("ON: a verified session passes", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    getStatus.mockResolvedValue({ gate: "ok" });
    expect(await checkMfaGate()).toBe("ok");
  });

  it("an unreadable switch counts as off in the browser only", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect(await isMfaEnforced()).toBe(false);
  });
});
