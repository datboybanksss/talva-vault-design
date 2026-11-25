import { describe, expect, it } from "vitest";
import { reportPeriod, reportDefaults, roleCan } from "./reports-contract";
import { peopleCsv } from "./reports-download";
import { ReportPerson } from "./reports-contract";
describe("Reports Phase 1 rules", () => {
  it("gives Viewer viewing only", () => {
    expect(roleCan("viewer", "view_reports")).toBe(true);
    expect(roleCan("viewer", "download_raw_data")).toBe(false);
    expect(roleCan("viewer", "include_email_addresses")).toBe(false);
  });
  it("Analyst may download without email access", () => {
    expect(roleCan("analyst", "download_raw_data")).toBe(true);
    expect(roleCan("analyst", "include_email_addresses")).toBe(false);
    expect(roleCan("analyst", "manage_access")).toBe(false);
  });
  it("Operations approval does not grant access management", () => {
    expect(roleCan("operations", "approve_large_sends")).toBe(true);
    expect(roleCan("operations", "manage_access")).toBe(false);
  });
  it("only Owner can include emails and manage access", () => {
    expect(roleCan("owner", "include_email_addresses")).toBe(true);
    expect(roleCan("owner", "manage_access")).toBe(true);
  });
  it("uses SAST dates and equal-length previous periods", () => {
    expect(
      reportPeriod({ ...reportDefaults, preset: "7d" }, "2026-11-24T22:30:00Z", null, null),
    ).toEqual({
      from: "2026-11-19",
      to: "2026-11-25",
      prior: { from: "2026-11-12", to: "2026-11-18" },
    });
  });
  it("clamps previous-month dates", () => {
    expect(
      reportPeriod(
        {
          ...reportDefaults,
          preset: "custom",
          from: "2026-03-30",
          to: "2026-03-31",
          compare: "last_month",
        },
        "2026-04-01T12:00:00Z",
        null,
        null,
      )?.prior,
    ).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });
  it("never invents a launch date", () => {
    expect(
      reportPeriod({ ...reportDefaults, preset: "launch" }, "2026-11-25T12:00:00Z", null, null),
    ).toBeNull();
  });
  it("all-time has no comparison", () => {
    expect(
      reportPeriod({ ...reportDefaults, preset: "all" }, "2026-11-25T12:00:00Z", null, "2026-09-01")
        ?.prior,
    ).toBeNull();
  });
  it("omits email and embedded addresses from People downloads", () => {
    const person = ReportPerson.parse({
      person_id: "x",
      name: "Person x@example.com",
      email: "x@example.com",
      account_type: "talent",
      agency_ids: [],
      agency_names: [],
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
    expect(peopleCsv([person], false)).not.toContain("x@example.com");
    expect(peopleCsv([person], false)).toContain("Not tracked");
    expect(peopleCsv([person], true)).toContain('"Email"');
  });
});
