import { describe, expect, it } from "vitest";
import { buildVaultTree, expiresSoon, needsFiling } from "@/lib/private-vault-tree";

const folders = [
  { id: "c1", parent_id: null, name: "Contracts and deals" },
  { id: "s1", parent_id: "c1", name: "Brand deals" },
  { id: "s2", parent_id: "s1", name: "2026" },
  { id: "c2", parent_id: null, name: "Identity" },
];
const docs = [
  { id: "d1", folder_id: "c1" },
  { id: "d2", folder_id: "s1" },
  { id: "d3", folder_id: "s2" },
  { id: "d4", folder_id: null },
  { id: "d5", folder_id: "hidden-folder" },
];

describe("private vault folder tree", () => {
  const t = buildVaultTree(folders, docs);
  it("counts documents in every subfolder of a category", () => {
    expect(t.docsIn("c1").map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  });
  it("lists documents filed directly on the category separately", () => {
    expect(t.directDocs("c1").map((d) => d.id)).toEqual(["d1"]);
  });
  it("keeps unfiled and hidden-folder documents reachable as unfiled", () => {
    expect(t.unfiled.map((d) => d.id)).toEqual(["d4", "d5"]);
  });
  it("builds the full folder path", () => {
    expect(t.pathOf("s1")).toBe("Contracts and deals › Brand deals");
    expect(t.pathOf(null)).toBeNull();
  });
  it("finds the category of a nested folder", () => {
    expect(t.categoryOf("s2")?.id).toBe("c1");
  });
});

describe("document flags", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  it("expires soon inside the notice window only", () => {
    expect(expiresSoon("2026-10-20T00:00:00Z", 30, now)).toBe(true);
    expect(expiresSoon("2026-12-20T00:00:00Z", 30, now)).toBe(false);
    expect(expiresSoon("2026-09-20T00:00:00Z", 30, now)).toBe(false);
    expect(expiresSoon("nonsense", 30, now)).toBe(false);
  });
  it("needs filing when unfiled or awaiting review", () => {
    expect(needsFiling({ id: "x", folder_id: "c1", pending_review: true }, false)).toBe(true);
    expect(needsFiling({ id: "x", folder_id: null }, true)).toBe(true);
    expect(needsFiling({ id: "x", folder_id: "c1" }, false)).toBe(false);
  });
});
