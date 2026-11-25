import { describe, it, expect } from "vitest";
import { launchRosterScope, redactReportEmails } from "./reports-launch-scope";
import { ReportPerson, reportDefaults } from "./reports-contract";
const person = ReportPerson.parse({
  person_id: "staff",
  name: "Staff",
  email: "staff@example.com",
  account_type: "agency_staff",
  agency_ids: ["agency-a"],
  agency_names: ["Agency"],
  status: "active",
  registered: true,
  registered_at: null,
  onboarded_at: null,
  stage: "registered",
  source: null,
  sign_ins: 0,
  active_days: 0,
  average_per_week: 0,
  first_sign_in: null,
  last_sign_in: null,
  days_since_last: null,
  dormant: null,
  documents: 0,
  capture_complete: false,
  launch_discount_status: null,
  keep_by: null,
});
describe("Launch shared Reports filters", () => {
  it("matches only invitations belonging to the already-filtered SQL roster", () => {
    const scope = launchRosterScope([person], reportDefaults);
    expect(
      scope.keepInvitation({ type: "agency", email: "other@example.com", agency_id: "agency-a" }),
    ).toBe(true);
    expect(
      scope.keepInvitation({ type: "agency", email: "other@example.com", agency_id: "agency-b" }),
    ).toBe(false);
  });
  it("contact-only scope never counts agency or talent invitations", () => {
    const scope = launchRosterScope([person], {
      ...reportDefaults,
      account_type: "trusted_contact",
    });
    expect(scope.keepInvitation({ type: "agency", email: "staff@example.com" })).toBe(false);
  });
  it("talent-only scope excludes agency invitations", () => {
    const scope = launchRosterScope([person], { ...reportDefaults, account_type: "talent" });
    expect(scope.keepInvitation({ type: "agency", email: "staff@example.com" })).toBe(false);
  });
  it("removes emails before the Reports response, including nested and embedded addresses", () => {
    const data = { rows: [{ name: "Name x@example.com", user_email: "x@example.com", count: 2 }] };
    expect(JSON.stringify(redactReportEmails(data))).not.toContain("x@example.com");
    expect(redactReportEmails(data).rows[0]?.count).toBe(2);
    expect(data.rows[0]?.user_email).toBe("x@example.com");
  });
});
