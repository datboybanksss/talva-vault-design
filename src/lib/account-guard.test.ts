import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, headers } = vi.hoisted(() => ({ rpc: vi.fn(), headers: new Map<string, string>() }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: { get: (k: string) => headers.get(k) ?? null } }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { blockPausedAccounts } from "./account-guard";
import { assertTalentWritable } from "./terms-guard";

const run = () => {
  const next = vi.fn(async () => "ran");
  // The isolated guard test substitutes a string-returning next() for the framework envelope.
  const server = blockPausedAccounts.options.server as (input: {
    next: () => Promise<string>;
    context: Record<string, never>;
    data: undefined;
  }) => Promise<string>;
  return { next, result: server({ next, context: {}, data: undefined }) };
};

describe("server enforcement: paused accounts can't call any server function", () => {
  beforeEach(() => {
    rpc.mockReset();
    headers.clear();
    process.env.SUPABASE_URL = "http://db.test";
    process.env.SUPABASE_PUBLISHABLE_KEY = "key";
  });

  it("refuses a paused account", async () => {
    headers.set("authorization", "Bearer token");
    rpc.mockResolvedValue({ data: { paused: true }, error: null });
    const { next, result } = run();
    await expect(result).rejects.toThrow(/ACCOUNT_PAUSED/);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an account that isn't paused through", async () => {
    headers.set("authorization", "Bearer token");
    rpc.mockResolvedValue({ data: { paused: false }, error: null });
    const { next, result } = run();
    await expect(result).resolves.toBe("ran");
    expect(next).toHaveBeenCalled();
  });

  it("refuses rather than guesses when the check fails", async () => {
    headers.set("authorization", "Bearer token");
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset", status: 500 } });
    await expect(run().result).rejects.toThrow(/couldn't check/);
  });

  it("leaves calls without a signed-in user to the function's own checks", async () => {
    const { next, result } = run();
    await expect(result).resolves.toBe("ran");
    expect(rpc).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});

describe("server enforcement: suspended talent are read-only", () => {
  it("refuses a write for a suspended talent", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    await expect(assertTalentWritable(supabase, "u1")).rejects.toThrow(/ACCOUNT_SUSPENDED/);
    expect(supabase.rpc).toHaveBeenCalledWith("talent_account_writable", { _user_id: "u1" });
  });
  it("allows a write for talent who aren't suspended", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    await expect(assertTalentWritable(supabase, "u1")).resolves.toBeUndefined();
  });
});
