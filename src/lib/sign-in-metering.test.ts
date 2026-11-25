import { describe, expect, it, vi } from "vitest";
import {
  sastDay,
  signInCoverage,
  SignInPageInput,
  type SignInSummary,
  signInCells,
} from "./sign-in-metering";
import { allReportRows, privateReportCsv, withoutEmails } from "./report-download";
const stats = { total: 4, active: 2, returning: 1, sign_ins: 3, average_days: 1.5, dormant: 2 };
const summary: SignInSummary = {
  groups: [
    { type: "talent", current: stats, prior: stats, tracking_since: "2026-09-01T10:00:00Z" },
  ],
  as_of: "2026-11-24T19:17:00Z",
  capture_started_at: "2026-10-01T19:00:00Z",
  unconfirmed_talent: 4,
  missing_registration_dates: 0,
  comparison_enabled: true,
  unresolved_logins: 1,
  prior: { from: "2026-09-01", to: "2026-09-30" },
};
describe("sign-in reporting contracts", () => {
  it("uses South African calendar days either side of midnight", () => {
    expect(sastDay("2026-10-01T21:59:00Z")).toBe("2026-10-01");
    expect(sastDay("2026-10-01T22:00:00Z")).toBe("2026-10-02");
  });
  it("defaults to Real and rejects impossible/inverted dates and bad paging", () => {
    expect(SignInPageInput.parse({ from: "2026-10-01", to: "2026-10-31" }).accounts).toBe("real");
    for (const value of [
      { from: "2026-02-30", to: "2026-10-31" },
      { from: "2026-11-01", to: "2026-10-31" },
      { from: "2026-10-01", to: "2026-10-31", limit: 201 },
    ])
      expect(SignInPageInput.safeParse(value).success).toBe(false);
  });
  it("pre-tracking data is unavailable, not a zero count", () => {
    const g = summary.groups[0];
    if (!g) throw new Error("fixture absent");
    expect(signInCoverage("2026-08-01", "2026-08-31", summary, g).available).toBe(false);
  });
  it("prior comparisons need complete coverage and dormancy needs 30 days", () => {
    const g = summary.groups[0];
    if (!g) throw new Error("fixture absent");
    expect(signInCoverage("2026-10-01", "2026-10-30", summary, g)).toMatchObject({
      complete: false,
      dormantKnown: false,
    });
    expect(signInCoverage("2026-10-02", "2026-10-31", summary, g)).toMatchObject({
      complete: true,
      dormantKnown: true,
    });
  });
  it("an ongoing period uses today as cutoff", () => {
    const g = summary.groups[0];
    if (!g) throw new Error("fixture absent");
    expect(signInCoverage("2026-11-01", "2026-12-31", summary, g).cutoff).toBe("2026-11-24");
  });
  it("missing sign-in dates are Not recorded, independent stays a zero-activity row", () =>
    expect(
      signInCells({
        person_id: "u",
        name: "Person",
        account_type: "talent",
        agency_ids: [],
        agency_names: [],
        onboarded_at: "2026-08-01",
        sign_ins: 0,
        active_days: 0,
        average_per_week: 0,
        first_sign_in: null,
        last_sign_in: null,
        days_since_last: null,
        dormant: true,
      }),
    ).toEqual([
      "Person",
      "Talent",
      "Independent",
      0,
      0,
      0,
      "Not recorded",
      "Not recorded",
      "Not recorded",
    ]));
});
describe("private raw downloads", () => {
  it("omits email columns and addresses embedded in names", () => {
    const csv = privateReportCsv(
      ["Name", "Email", "Sign-ins"],
      [["Lara (lara@example.com)", "other@example.com", 3]],
    );
    expect(csv).not.toContain("example.com");
    expect(csv).not.toContain('"Email"');
    expect(csv).toContain("3");
  });
  it("escapes formula injection and quotes", () =>
    expect(privateReportCsv(["Name"], [['=HYPERLINK("x")']])).toContain("'=HYPERLINK("));
  it("print redaction removes embedded addresses", () =>
    expect(withoutEmails("Contact SOME+tag@Example.com")).toBe("Contact [email omitted]"));
  it("downloads all filtered pages, not just the visible page", async () => {
    const fn = vi.fn(async (offset: number) => ({ total: 3, rows: offset === 0 ? [1, 2] : [3] }));
    expect(await allReportRows(fn)).toEqual([1, 2, 3]);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
  });
  it("refuses incomplete and changed exports", async () => {
    await expect(allReportRows(async () => ({ total: 1, rows: [] }))).rejects.toThrow("changed");
    await expect(
      allReportRows(async (offset) => ({ total: offset === 0 ? 2 : 3, rows: [1] })),
    ).rejects.toThrow("changed");
  });
});
