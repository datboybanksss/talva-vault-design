import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PAUSED_CODE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_UNAVAILABLE_MESSAGE,
  accountActionEffect,
  accountStateActions,
  applyAccountAction,
  isValidReason,
} from "./account-state";
import {
  accountStatusCounts,
  agencyAccountStatus,
  talentAccountStatus,
} from "./account-filters";
import { friendlyError } from "./friendly-error";
import { friendlyAuthError } from "./password";

const active = { paused: false, suspended: false };

describe("pause and suspend transitions", () => {
  it("active → pause → unpause returns to active", () => {
    const paused = applyAccountAction("pause", active);
    expect(paused).toEqual({ paused: true, suspended: false });
    expect(applyAccountAction("unpause", paused)).toEqual(active);
  });
  it("active → suspend → unsuspend returns to active", () => {
    const s = applyAccountAction("suspend", active);
    expect(s).toEqual({ paused: false, suspended: true });
    expect(applyAccountAction("unsuspend", s)).toEqual(active);
  });
  it("a suspended account that is paused returns to suspended when unpaused", () => {
    const s = applyAccountAction("suspend", active);
    const p = applyAccountAction("pause", s);
    expect(p).toEqual({ paused: true, suspended: true });
    expect(applyAccountAction("unpause", p)).toEqual({ paused: false, suspended: true });
  });
  it("refuses actions that don't fit the current status", () => {
    expect(() => applyAccountAction("unpause", active)).toThrow();
    expect(() => applyAccountAction("unsuspend", active)).toThrow();
    expect(() => applyAccountAction("suspend", { paused: true, suspended: false })).toThrow();
    expect(() => applyAccountAction("pause", { paused: true, suspended: true })).toThrow();
  });
});

describe("actions shown for each status", () => {
  it("active shows Pause and Suspend", () => {
    expect(accountStateActions(active, true)).toEqual(["pause", "suspend"]);
  });
  it("paused shows only Unpause", () => {
    expect(accountStateActions({ paused: true, suspended: false }, true)).toEqual(["unpause"]);
    expect(accountStateActions({ paused: true, suspended: true }, true)).toEqual(["unpause"]);
  });
  it("suspended shows Unsuspend and Pause", () => {
    expect(accountStateActions({ paused: false, suspended: true }, true)).toEqual(["unsuspend", "pause"]);
  });
  it("admins without edit rights get no actions", () => {
    expect(accountStateActions(active, false)).toEqual([]);
  });
});

describe("reasons", () => {
  it("pause reasons are Legal, Investigation, Other", () => {
    expect(isValidReason("pause", "legal")).toBe(true);
    expect(isValidReason("pause", "investigation")).toBe(true);
    expect(isValidReason("pause", "other")).toBe(true);
    expect(isValidReason("pause", "non_payment")).toBe(false);
  });
  it("suspend reasons are Non-payment, Other", () => {
    expect(isValidReason("suspend", "non_payment")).toBe(true);
    expect(isValidReason("suspend", "other")).toBe(true);
    expect(isValidReason("suspend", "legal")).toBe(false);
    expect(isValidReason("suspend", "")).toBe(false);
  });
  it("suspension effect names the read-only years", () => {
    expect(accountActionEffect("suspend", "talent", 10)).toContain("10 years");
  });
});

describe("status shown in lists and reports", () => {
  it("pause overlays the stored status", () => {
    expect(agencyAccountStatus({ status: "suspended", paused_at: "2026-10-22" })).toBe("paused");
    expect(agencyAccountStatus({ status: "suspended", paused_at: null })).toBe("suspended");
    expect(talentAccountStatus("2026-01-01", { paused_at: "x", suspended_at: "y" })).toBe("paused");
    expect(talentAccountStatus("2026-01-01", { suspended_at: "y" })).toBe("suspended");
    expect(talentAccountStatus(null)).toBe("incomplete");
  });
  it("accounts by status counts real accounts only by default", () => {
    const c = accountStatusCounts([
      { type: "agency", status: "paused" },
      { type: "agency", status: "accepted" },
      { type: "talent", status: "suspended" },
      { type: "talent", status: "suspended", is_test: true },
    ]);
    expect(c.agency.paused).toBe(1);
    expect(c.agency.accepted).toBe(1);
    expect(c.talent.suspended).toBe(1);
    expect(c.talent.paused).toBe(0);
  });
});

describe("what a paused or suspended account is told", () => {
  it("sign-in for a paused (blocked) account shows the approved message, no reason", () => {
    expect(friendlyAuthError(new Error("User is banned"))).toBe(
      "Your account is temporarily unavailable. Please contact hello@talvault.com.",
    );
    expect(friendlyError(new Error(`${ACCOUNT_PAUSED_CODE}: anything`))).toBe(ACCOUNT_UNAVAILABLE_MESSAGE);
  });
  it("a refused write from a suspended account reads as read-only", () => {
    expect(friendlyError(new Error(`${ACCOUNT_SUSPENDED_CODE}: x`))).toMatch(/read-only/);
  });
});
