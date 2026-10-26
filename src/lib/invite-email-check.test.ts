import { describe, expect, it } from "vitest";
import {
  INVITE_EMAIL_MESSAGES as M,
  decideInviteEmailConflict,
  exactIlike,
  isBlockingInvite,
  normaliseInviteEmail,
  sameEmail,
} from "./invite-email-check";
import { friendlyError } from "./friendly-error";
import { isUuid } from "./ids";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("invite email matching", () => {
  it("ignores case and surrounding spaces", () => {
    expect(normaliseInviteEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
    expect(sameEmail("  JANE@x.com", "jane@X.com  ")).toBe(true);
  });
  it("escapes wildcards so lookups are exact", () => {
    expect(exactIlike(" A_b%c@x.com ")).toBe("a\\_b\\%c@x.com");
  });
});

describe("pending invitations", () => {
  const row = { id: "1", email: "Jane@x.com", status: "pending", expires_at: future };
  it("a pending unexpired invite blocks, even with mixed case and spaces", () => {
    expect(isBlockingInvite(row, "  jane@X.COM ")).toBe(true);
  });
  it("revoked invites do not block", () => {
    expect(isBlockingInvite({ ...row, status: "revoked" }, "jane@x.com")).toBe(false);
  });
  it("expired invites do not block", () => {
    expect(isBlockingInvite({ ...row, expires_at: past }, "jane@x.com")).toBe(false);
    expect(isBlockingInvite({ ...row, status: "expired" }, "jane@x.com")).toBe(false);
  });
});

describe("decideInviteEmailConflict", () => {
  it("admin flows refuse an existing account", () => {
    for (const flow of ["admin_agency", "admin_talent", "admin_admin"] as const) {
      expect(
        decideInviteEmailConflict(flow, { hasAccount: true, pendingLink: false })?.message,
      ).toBe(M.account);
    }
  });
  it("agency staff gets the staff message without any account details", () => {
    const c = decideInviteEmailConflict("agency_staff", { hasAccount: true, pendingLink: false });
    expect(c?.message).toBe(M.staffAccount);
    expect(c?.link).toBeNull();
  });
  it("agency talent never reveals an existing account (Agency T&C §6.3)", () => {
    expect(
      decideInviteEmailConflict("agency_talent", { hasAccount: true, pendingLink: false }),
    ).toBeNull();
  });
  it("a pending invitation returns the pending message with its link", () => {
    const c = decideInviteEmailConflict("admin_talent", {
      hasAccount: false,
      pendingLink: "/admin/invitations/talent/abc",
    });
    expect(c?.message).toBe(M.pending);
    expect(c?.link).toBe("/admin/invitations/talent/abc");
  });
  it("no clash returns null", () => {
    expect(
      decideInviteEmailConflict("admin_agency", { hasAccount: false, pendingLink: false }),
    ).toBeNull();
  });
});

describe("messages reach the user unchanged", () => {
  it.each(Object.values(M))("%s", (msg) => {
    expect(friendlyError(new Error(msg), "fallback")).toBe(msg);
  });
});

describe("isUuid", () => {
  it("rejects blanks and labels", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("new")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("2908166d-8ecf-42f7-94bd-f0752084a87b")).toBe(true);
  });
});
