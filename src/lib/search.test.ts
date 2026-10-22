import { describe, expect, it } from "vitest";
import { matchesSearch, normaliseSearch, searchParam } from "@/lib/search";
import { accountOptionCounts, filterAccounts, type AccountRow } from "@/lib/account-filters";

const rows: (AccountRow & { name: string })[] = [
  { name: "NPI Talent Management", type: "agency", status: "accepted", search_text: ["NPI Talent Management", "Israel Noko", "israel@npiconsulting.co.za"] },
  { name: "Omar Talent Agency", type: "agency", status: "invited", is_test: true, search_text: ["Omar Talent Agency", "omartabengwa@gmail.com"] },
  { name: "Zoë Mokoena", type: "talent", status: "active", linked_agencies: ["NPI Talent Management"], search_text: ["Zoë Mokoena", "zoe@example.com", "NPI Talent Management"] },
  { name: "Sipho Dlamini", type: "talent", status: "incomplete", linked_agencies: [], search_text: ["Sipho Dlamini", "sipho@example.com"] },
];
const base = { type: "all" as const, status: "all", link: "all" as const, scope: "all" as const };
const names = (q: string, f = {}) => filterAccounts(rows, { ...base, ...f, q }).map((r) => r.name);

describe("admin search", () => {
  it("matches part of a name", () => {
    expect(names("dlam")).toEqual(["Sipho Dlamini"]);
  });
  it("ignores case and surrounding spaces", () => {
    expect(names("  oMAR talent ")).toEqual(["Omar Talent Agency"]);
  });
  it("matches email addresses, including partial emails", () => {
    expect(names("israel@npiconsulting.co.za")).toEqual(["NPI Talent Management"]);
    expect(names("@gmail.com")).toEqual(["Omar Talent Agency"]);
  });
  it("ignores accents", () => {
    expect(names("zoe moko")).toEqual(["Zoë Mokoena"]);
    expect(matchesSearch(["José"], "jose")).toBe(true);
  });
  it("finds talent linked to an agency by the agency name", () => {
    expect(names("npi")).toEqual(["NPI Talent Management", "Zoë Mokoena"]);
  });
  it("combines with the Type, Status and Accounts filters", () => {
    expect(names("talent", { type: "talent" })).toEqual(["Zoë Mokoena"]);
    expect(names("talent", { type: "agency", status: "invited" })).toEqual(["Omar Talent Agency"]);
    expect(names("talent", { scope: "real" })).toEqual(["NPI Talent Management", "Zoë Mokoena"]);
  });
  it("option counts reflect the search", () => {
    const c = accountOptionCounts(rows, { ...base, q: "npi" });
    expect(c.type).toMatchObject({ all: 2, agency: 1, talent: 1 });
    expect(c.type.all).toBe(c.type.agency + c.type.talent);
  });
  it("empty search matches everything; URL form drops blanks", () => {
    expect(names("   ")).toHaveLength(4);
    expect(searchParam("  ")).toBeUndefined();
    expect(searchParam(" npi ")).toBe("npi");
    expect(normaliseSearch("  A   B ")).toBe("a b");
  });
});
