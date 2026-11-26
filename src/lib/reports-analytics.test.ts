import { describe, it, expect } from "vitest";
import {
  loginRangeComplete,
  trendRows,
  analyseHistory,
  datasetRows,
  sectionRows,
  SECTION_IDS,
  HistorySnapshot,
} from "./reports-analytics";
import { ReportPerson, roleCan } from "./reports-contract";
import { matchesInviteFilter } from "./launch-reporting-core";
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

describe("drill-downs, section downloads and spend", () => {
  const args = ["2026-07-13", "2026-11-26", null, "2026-07-13"] as const;
  const withStranger = HistorySnapshot.parse({
    ...history,
    records: [
      ...history.records,
      // Someone outside the People list for these filters (for example an administrator).
      { id: "d", kind: "document", at: "2026-09-20T10:00:00Z", person_id: "not-listed" },
      { id: "d2", kind: "document", at: "2026-09-20T10:00:00Z", person_id: "talent-a" },
      {
        id: "i2",
        kind: "invitation",
        type: "talent",
        source: "admin",
        at: "2026-08-01T09:00:00Z",
        person_id: "not-listed",
        status: "pending",
      },
    ],
  });
  it("every figure's people are rows of the People list", () => {
    const a = analyseHistory(withStranger, ...args);
    const listed = new Set(withStranger.people.map((p) => p.person_id));
    const all = [
      ...a.metrics,
      ...Object.values(a.figures).flat(),
      ...a.attention.map((r) => ({ people: r.people })),
      ...a.funnels.talent,
      ...a.sources,
    ].flatMap((f) => f.people);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((id) => listed.has(id))).toBe(true);
  });
  it("a people figure equals the number of people it opens", () => {
    const a = analyseHistory(withStranger, ...args);
    const sent = a.funnels.talent[0];
    expect(sent?.count).toBe(1);
    expect(sent?.people).toEqual(["talent-a"]);
    expect(a.funnel_unlisted).toBe(1);
    const uploaded = a.figures.documents.find((f) => f.label === "Uploaded");
    // Two documents were uploaded; one person in the People list is behind them.
    expect(uploaded?.value).toBe(2);
    expect(uploaded?.people).toEqual(["talent-a"]);
  });
  it("section downloads never carry an email address", () => {
    const a = analyseHistory(withStranger, ...args);
    for (const section of SECTION_IDS) {
      const text = JSON.stringify(sectionRows(withStranger, a, section));
      expect(text).not.toContain("a@example.com");
      expect(text).not.toMatch(/"email"/);
    }
  });
  it("a section download holds that section's own records", () => {
    const a = analyseHistory(withStranger, ...args);
    expect(sectionRows(withStranger, a, "engagement_documents")).toHaveLength(2);
    expect(sectionRows(withStranger, a, "growth_sources")).toHaveLength(2);
    expect(sectionRows(withStranger, a, "business_months")).toHaveLength(5);
  });
  it("cost per registration is the period's spend divided by registrations from that channel", () => {
    const a = analyseHistory(history, ...args, [
      { channel: "admin", month: "2026-07", amount_cents: 100000 },
      { channel: "admin", month: "2026-08", amount_cents: 50000 },
      // Outside the selected period: ignored.
      { channel: "admin", month: "2026-06", amount_cents: 999900 },
    ]);
    const admin = a.acquisition.find((r) => r.channel === "admin");
    expect(admin?.registered).toBe(1);
    expect(admin?.spend).toBe(1500);
    expect(admin?.cost).toBe(1500);
  });
  it("no spend recorded means no cost is shown", () => {
    const admin = analyseHistory(history, ...args).acquisition.find((r) => r.channel === "admin");
    expect(admin?.spend).toBeNull();
    expect(admin?.cost).toBeNull();
  });
  it("only Owner and Operations may record spend", () => {
    expect(roleCan("owner", "manage_spend")).toBe(true);
    expect(roleCan("operations", "manage_spend")).toBe(true);
    expect(roleCan("analyst", "manage_spend")).toBe(false);
    expect(roleCan("viewer", "manage_spend")).toBe(false);
  });
  it("launch invitation figures date a sent invitation by its first send", () => {
    const filter = {
      fromIso: "2026-08-01T00:00:00Z",
      toIso: "2026-08-31T23:59:59Z",
      type: "all" as const,
      segment: "all" as const,
    };
    const row = {
      id: "i",
      type: "talent" as const,
      segment: "independent" as const,
      status: "pending",
      email: "a@example.com",
      created_at: "2026-07-20T10:00:00Z",
      expires_at: null,
      first_sent_at: "2026-08-03T10:00:00Z",
      accepted_at: null,
      source: null,
    };
    expect(matchesInviteFilter(row, filter)).toBe(true);
    // A draft was never sent, so it stays dated by creation.
    expect(matchesInviteFilter({ ...row, status: "draft", first_sent_at: null }, filter)).toBe(
      false,
    );
  });
});
