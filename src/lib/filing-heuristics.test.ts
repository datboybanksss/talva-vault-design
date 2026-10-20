import { describe, expect, it } from "vitest";
import { suggestFromFileName } from "./filing-heuristics";

describe("filename destination matching", () => {
  const catalog = [
    { id: "travel", label: "Travel & Visas" },
    { id: "identity", label: "Identity & Personal" },
    { id: "passport", label: "Identity & Personal → Passport" },
    { id: "deep", label: "Identity & Personal → Travel documents → Passport" },
  ];
  it("passport.pdf chooses the deepest Passport subfolder, before hints", () => {
    expect(suggestFromFileName("passport.pdf", catalog)?.folder_id).toBe("deep");
  });
  it("uses hints when no keyword subfolder exists", () => {
    expect(suggestFromFileName("visa.pdf", catalog)?.folder_id).toBe("travel");
  });
  it("never invents an absent destination", () => {
    expect(suggestFromFileName("passport.pdf", [])).toBeNull();
  });
});
