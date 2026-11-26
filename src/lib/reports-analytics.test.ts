import { describe, it, expect } from "vitest";
import {
  loginRangeComplete,
  trendRows,
  analyseHistory,
  datasetRows,
  HistorySnapshot,
} from "./reports-analytics";
import { ReportPerson } from "./reports-contract";
import { matrixCsv } from "./reports-export-browser";
const person = ReportPerson.parse({
  person_id: "talent-a",
  name: "Talent",
  email: "a@example.com",
  account_type: "talent",
  agency_ids: [],
  agency_names: [],
  status: "active",
  registered: true,
  registered_at: "2026-07-13T10:00:00Z",
  onboarded_at: "2026-09-16T10:00:00Z",
  stage: "onboarded",
  source: "admin",
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
const history = HistorySnapshot.parse({
  people: [person],
  agencies: [],
  launch: null,
  contact_started_at: "2026-11-25T08:00:00Z",
  as_of: "2026-11-26T12:00:00Z",
  records: [
    { id: "r", kind: "registration", at: "2026-07-13T10:00:00Z", person_id: "talent-a" },
    { id: "l", kind: "sign_in", at: "2026-09-14T13:00:00Z", person_id: "talent-a" },
    { id: "l2", kind: "sign_in", at: "2026-09-15T13:00:00Z", person_id: "talent-a" },
    {
      id: "i",
      kind: "invitation",
      type: "talent",
      source: "admin",
      at: "2026-07-13T09:00:00Z",
      accepted_at: "2026-07-13T10:00:00Z",
      person_id: "talent-a",
      status: "accepted",
    },
  ],
});
describe("historical Reports rules", () => {
  it("sign-ins begin on 14 September 2026, not the newer installation date", () => {
    expect(loginRangeComplete("2026-09-14", "2026-09-30")).toBe(true);
    expect(loginRangeComplete("2026-09-13", "2026-09-30")).toBe(false);
  });
  it("15–24 November is missing and cannot establish inactivity", () => {
    expect(loginRangeComplete("2026-11-15", "2026-11-24")).toBe(false);
    expect(loginRangeComplete("2026-11-25", "2026-11-26")).toBe(true);
    expect(
      analyseHistory(history, "2026-07-13", "2026-11-26", null, "2026-07-13").metrics.find(
        (m) => m.label === "Dormant users",
      )?.value,
    ).toBe("Not recorded");
  });
  it("all months include July historical registrations", () => {
    const rows = trendRows(history, "2026-07-13", "2026-11-26", "month");
    expect(rows.map((r) => r.label)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(rows[0]?.registrations).toBe(1);
    expect(rows[0]?.active).toBeNull();
  });
  it("persistent own-upload onboarding survives absence of current documents", () =>
    expect(
      analyseHistory(history, "2026-07-13", "2026-11-26", null, "2026-07-13").metrics.find(
        (m) => m.label === "Onboarding rate",
      )?.value,
    ).toBe(100));
  it("historical invitation acceptance and returning days are counted", () => {
    const a = analyseHistory(history, "2026-07-13", "2026-11-26", null, "2026-07-13");
    expect(a.funnels.talent[1]?.count).toBe(1);
    expect(a.metrics.find((m) => m.label === "Returning users")?.value).toBe(1);
  });
  it("raw People omit email fields unless explicitly included", () => {
    expect(datasetRows(history, "people", "2026-07-13", "2026-11-26", false)[0]).not.toHaveProperty(
      "email",
    );
    expect(datasetRows(history, "people", "2026-07-13", "2026-11-26", true)[0]).toHaveProperty(
      "email",
      "a@example.com",
    );
  });
  it("CSV prevents spreadsheet formula injection", () =>
    expect(matrixCsv(["Name"], [["=HYPERLINK(x)"]])).toContain("'=HYPERLINK(x)"));
});
