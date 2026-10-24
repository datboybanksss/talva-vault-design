import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, headers } = vi.hoisted(() => ({ rpc: vi.fn(), headers: new Map<string, string>() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: { get: (k: string) => headers.get(k) ?? null } }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import { requireMfaVerified } from "./mfa-guard";
import { isMfaBootstrap, verifiedSessionId } from "./mfa-policy";

function run(name: string, filename: string) {
  const next = vi.fn(async () => "ran");
  const server = (requireMfaVerified as unknown as { options: { server: (opts: unknown) => Promise<unknown> } }).options.server;
  return { next, result: server({ next, serverFnMeta: { name, filename, id: "compiled" } }) };
}

describe("TVA-SEC-101 global server enforcement", () => {
  beforeEach(() => {
    rpc.mockReset(); headers.clear();
    process.env.SUPABASE_URL = "http://db.test";
    process.env.SUPABASE_PUBLISHABLE_KEY = "key";
  });
  for (const [name, filename] of [
    ["getTalentContext", "src/lib/talent.functions.ts"],
    ["agencyWhoami", "src/lib/agency.functions.ts"],
    ["whoami", "src/lib/admin.functions.ts"],
  ]) {
    it(`refuses password-only ${name}`, async () => {
      headers.set("authorization", "Bearer session-A");
      rpc.mockResolvedValue({ data: false, error: null });
      const { next, result } = run(name, filename);
      await expect(result).rejects.toThrow("MFA_REQUIRED");
      expect(next).not.toHaveBeenCalled();
    });
    it(`allows verified ${name}`, async () => {
      headers.set("authorization", "Bearer session-A");
      rpc.mockResolvedValue({ data: true, error: null });
      await expect(run(name, filename).result).resolves.toBe("ran");
      expect(rpc).toHaveBeenCalledWith("mfa_session_ok");
    });
  }
  it("fails closed on database errors", async () => {
    headers.set("authorization", "Bearer session-A");
    rpc.mockResolvedValue({ data: null, error: { code: "offline" } });
    await expect(run("whoami", "src/lib/admin.functions.ts").result).rejects.toThrow("MFA_REQUIRED");
  });
  it("leaves unauthenticated public calls unchanged", async () => {
    await expect(run("activateTalentInvitation", "src/lib/talent-activation.functions.ts").result).resolves.toBe("ran");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("allows the code flow but not an impersonated compiled name", async () => {
    headers.set("authorization", "Bearer session-A");
    await expect(run("verifySignInCode", "src/lib/mfa.functions.ts").result).resolves.toBe("ran");
    expect(isMfaBootstrap({ name: "verifySignInCode", filename: "src/lib/admin.functions.ts" })).toBe(false);
  });
  it("uses only the signed JWT session claim, never device input", () => {
    expect(verifiedSessionId({ session_id: "session-A", device: "chosen-B" })).toBe("session-A");
    expect(verifiedSessionId({ device: "session-A" })).toBeNull();
    expect(verifiedSessionId({ session_id: "" })).toBeNull();
  });
});