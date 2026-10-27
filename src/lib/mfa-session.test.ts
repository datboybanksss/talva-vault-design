import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => {
  const chain: Record<string, unknown> = {};
  chain.middleware = () => chain;
  chain.inputValidator = () => chain;
  chain.handler = () => chain;
  return { createServerFn: () => chain };
});

import { verifiedSessionId } from "./mfa.functions";

describe("verification is bound to the verified token's session_id", () => {
  it("uses the session_id claim", () => {
    expect(verifiedSessionId({ session_id: "abc", sub: "u" })).toBe("abc");
  });
  it("a token without session_id can never be verified", () => {
    expect(verifiedSessionId({ sub: "u" })).toBeNull();
    expect(verifiedSessionId({ session_id: "  " })).toBeNull();
    expect(verifiedSessionId({ session_id: 42 })).toBeNull();
  });
});
