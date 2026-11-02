import { describe, expect, it } from "vitest";
import { buildTestScope, inviteFunnel, isSentInvitation, testEmailKey } from "./report-scope";

const src = {
  agencies: [
    { id: "ag-test", is_test: true, contact_email: "agent1@talvault.com" },
    { id: "ag-real", is_test: false, contact_email: "boss@real.co.za" },
  ],
  talent: [
    { id: "tp-test", user_id: "u-test", email: "talent1@talvault.com", is_test: true },
    { id: "tp-real", user_id: "u-real", email: "lara@real.co.za", is_test: false },
  ],
};

describe("test-account scope", () => {
  it("ignores plus-address tags and case when matching emails", () => {
    expect(testEmailKey(" Talent1+run5@TalVault.com ")).toBe("talent1@talvault.com");
  });

  it("counts an invitation as test when the recipient is a plus-addressed test email", () => {
    const ts = buildTestScope(src, "real");
    expect(ts.inviteIsTest({ email: "talent1+anything@talvault.com" })).toBe(true);
    expect(ts.inviteIsTest({ email: "talent2@talvault.com" })).toBe(false);
  });

  it("counts an invitation as test when the sending agency is a test agency", () => {
    const ts = buildTestScope(src, "real");
    expect(ts.inviteIsTest({ email: "someone@else.com", agency_id: "ag-test" })).toBe(true);
    expect(ts.inviteIsTest({ email: "someone@else.com", agency_id: "ag-real" })).toBe(false);
  });

  it("treats a test agency's contact email as a test email", () => {
    expect(buildTestScope(src, "real").emailIsTest("agent1+x@talvault.com")).toBe(true);
  });

  it("keeps only real rows by default, only test rows for Test, everything for All", () => {
    expect(buildTestScope(src, "real").keep(true)).toBe(false);
    expect(buildTestScope(src, "real").keep(false)).toBe(true);
    expect(buildTestScope(src, "test").keep(false)).toBe(false);
    expect(buildTestScope(src, "test").keep(true)).toBe(true);
    expect(buildTestScope(src, "all").keep(true)).toBe(true);
  });

  it("flags data by its agency or talent", () => {
    const ts = buildTestScope(src, "real");
    expect(ts.agencyIsTest("ag-test")).toBe(true);
    expect(ts.talentUserIsTest("u-test")).toBe(true);
    expect(ts.talentProfileIsTest("tp-real")).toBe(false);
  });
});

describe("invitation funnel", () => {
  const from = "2026-10-01T00:00:00.000Z";
  const to = "2026-10-31T23:59:59.999Z";

  it("never counts drafts as sent", () => {
    expect(isSentInvitation({ status: "draft" })).toBe(false);
    const f = inviteFunnel(
      [
        { status: "draft", created_at: "2026-10-05T00:00:00Z" },
        { status: "pending", created_at: "2026-10-05T00:00:00Z", first_sent_at: "2026-10-06T00:00:00Z" },
      ],
      from,
      to,
    );
    expect(f.sent).toBe(1);
  });

  it("reports accepted of sent, rate and median days from the send date", () => {
    const f = inviteFunnel(
      [
        {
          status: "accepted",
          created_at: "2026-09-20T00:00:00Z",
          first_sent_at: "2026-10-02T00:00:00Z",
          accepted_at: "2026-10-04T00:00:00Z",
        },
        { status: "pending", created_at: "2026-10-10T00:00:00Z" },
        { status: "expired", created_at: "2026-10-11T00:00:00Z" },
        { status: "accepted", created_at: "2026-10-12T00:00:00Z", accepted_at: "2026-10-16T00:00:00Z" },
      ],
      from,
      to,
    );
    expect(f).toEqual({ sent: 4, accepted: 2, rate: 50, medianDaysToAccept: 3 });
  });
});
