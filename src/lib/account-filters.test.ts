import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUSES,
  accountOptionCounts,
  filterAccounts,
  normaliseAccountStatus,
  normaliseTalentLink,
  talentAccountStatus,
} from "./account-filters";

const rows = [
  { type: "agency" as const, status: "accepted" },
  { type: "agency" as const, status: "suspended" },
  { type: "talent" as const, status: "active", linked_agencies: ["Acme"] },
  { type: "talent" as const, status: "active", linked_agencies: [] },
  { type: "talent" as const, status: "incomplete", linked_agencies: [] },
];

describe("admin accounts filters", () => {
  it("offers the agency_status enum plus derived talent statuses", () => {
    expect(ACCOUNT_STATUSES).toEqual([
      "incomplete",
      "invited",
      "accepted",
      "expired",
      "declined",
      "suspended",
      "active",
    ]);
  });
  it("derives talent status from activation", () => {
    expect(talentAccountStatus("2026-10-01T00:00:00Z")).toBe("active");
    expect(talentAccountStatus(null)).toBe("incomplete");
  });
  it("falls back to all for unknown URL values", () => {
    expect(normaliseAccountStatus("archived")).toBe("all");
    expect(normaliseTalentLink("x")).toBe("all");
  });
  it("Suspended agencies filter returns only suspended agencies", () => {
    expect(filterAccounts(rows, { type: "agency", status: "suspended", link: "all" })).toHaveLength(
      1,
    );
  });
  it("independent talent filter excludes agency-linked talent", () => {
    expect(
      filterAccounts(rows, { type: "talent", status: "all", link: "independent" }),
    ).toHaveLength(2);
  });
  it("link filter is ignored unless type is talent", () => {
    expect(filterAccounts(rows, { type: "all", status: "all", link: "linked" })).toHaveLength(5);
  });
  it("counts each option with the other filters applied", () => {
    const c = accountOptionCounts(rows, { type: "talent", status: "active", link: "all" });
    expect(c.type).toEqual({ all: 2, agency: 0, talent: 2 });
    expect(c.status.incomplete).toBe(1);
    expect(c.link).toEqual({ all: 2, linked: 1, independent: 1 });
  });
});
