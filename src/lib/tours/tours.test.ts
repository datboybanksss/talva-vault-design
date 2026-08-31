import { describe, expect, it } from "vitest";
import { GUIDES, getModuleGuides, getOverviewGuide, matchModuleGuides } from "./index";

describe("tour registry", () => {
  it("has exactly one overview guide per portal", () => {
    for (const portal of ["admin", "agency", "talent"] as const) {
      expect(getOverviewGuide(portal)).toBeTruthy();
      expect(GUIDES.filter((g) => g.portal === portal && g.kind === "overview")).toHaveLength(1);
    }
  });

  it("uses unique guide ids and unique step keys within a guide", () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GUIDES) {
      const keys = g.steps.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(g.steps.length).toBeGreaterThan(0);
    }
  });

  it("gives every module guide match prefixes and routed steps", () => {
    for (const g of GUIDES.filter((x) => x.kind === "module")) {
      expect(g.match?.length).toBeGreaterThan(0);
      for (const s of g.steps) expect(s.route?.to).toBeTruthy();
    }
  });

  it("matches module guides by path prefix only", () => {
    expect(matchModuleGuides("agency", "/agency/quotes-invoices").map((g) => g.id)).toEqual([
      "agency.quotes-invoices",
    ]);
    expect(matchModuleGuides("agency", "/agency")).toEqual([]);
    expect(matchModuleGuides("talent", "/talent/vault").map((g) => g.id)).toEqual(["talent.vault"]);
  });

  it("keeps module guides out of the overview list", () => {
    expect(getModuleGuides("agency").every((g) => g.kind === "module")).toBe(true);
  });
});
