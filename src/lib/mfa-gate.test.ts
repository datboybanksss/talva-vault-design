import { describe, expect, it, vi } from "vitest";
import { decideMfaGate, isMfaAllowListed, MFA_ALLOW_LIST } from "./mfa-gate";
import { isMfaRequiredError, mfaCodeScreenUrl } from "./mfa-redirect";
import { publicFunctionError } from "./public-function-error";

vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => null }));

const admin = { filename: "src/lib/admin.functions.ts", name: "listAccounts" };
const agency = { filename: "src/lib/agency.functions.ts", name: "listAgencyInvitationsPaged" };
const talent = { filename: "src/lib/talent.functions.ts", name: "getTalentDashboard" };

describe("server two-step gate", () => {
  it("OFF: database says ok, every function runs as today", async () => {
    const check = vi.fn().mockResolvedValue({ ok: true });
    for (const meta of [admin, agency, talent]) {
      expect(await decideMfaGate({ bearer: "t", meta, check })).toBe("pass");
    }
  });

  it("ON: an unverified session is refused by admin, agency and talent functions", async () => {
    const check = vi.fn().mockResolvedValue({ ok: false });
    for (const meta of [admin, agency, talent]) {
      expect(await decideMfaGate({ bearer: "t", meta, check })).toBe("refuse");
    }
  });

  it("ON: the code-flow functions stay callable", async () => {
    const check = vi.fn().mockResolvedValue({ ok: false });
    for (const meta of MFA_ALLOW_LIST) {
      expect(await decideMfaGate({ bearer: "t", meta, check })).toBe("pass");
    }
    expect(check).not.toHaveBeenCalled();
  });

  it("verification is per session: A verified does not unlock B", async () => {
    const verified = new Set(["session-A"]);
    const check = async (token: string) => ({ ok: verified.has(token) });
    expect(await decideMfaGate({ bearer: "session-A", meta: talent, check })).toBe("pass");
    expect(await decideMfaGate({ bearer: "session-B", meta: talent, check })).toBe("refuse");
  });

  it("public calls without a token are untouched", async () => {
    const check = vi.fn();
    expect(await decideMfaGate({ bearer: null, meta: talent, check })).toBe("pass");
    expect(check).not.toHaveBeenCalled();
  });

  it("a failed check never lets an unverified call through", async () => {
    const check = vi.fn().mockResolvedValue({ failed: true });
    expect(await decideMfaGate({ bearer: "t", meta: admin, check })).toBe("unavailable");
  });

  it("allow-list matches exact file and name only", () => {
    expect(isMfaAllowListed({ filename: "/app/src/lib/mfa.functions.ts", name: "verifySignInCode" })).toBe(true);
    expect(isMfaAllowListed({ filename: "src/lib/mfa.functions.ts", name: "other" })).toBe(false);
    expect(isMfaAllowListed({ filename: "src/lib/x.functions.ts", name: "verifySignInCode" })).toBe(false);
    expect(MFA_ALLOW_LIST).toHaveLength(5);
  });

  it("the refusal keeps the stable code and sends the user to the code screen", () => {
    const err = publicFunctionError(new Error("MFA_REQUIRED: Please enter the sign-in code we emailed you to continue."));
    expect(err.message).toMatch(/^MFA_REQUIRED:/);
    expect(isMfaRequiredError(err)).toBe(true);
    expect(isMfaRequiredError(new Error("ACCOUNT_PAUSED: x"))).toBe(false);
    expect(mfaCodeScreenUrl({ pathname: "/talent/vault", search: "?a=1", hash: "" })).toBe(
      "/auth?next=%2Ftalent%2Fvault%3Fa%3D1",
    );
  });
});
