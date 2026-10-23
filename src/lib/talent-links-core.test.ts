import { describe, expect, it } from "vitest";
import { classifyTalentLink } from "./talent-links-core";

const now = Date.parse("2026-10-23T00:00:00Z");

describe("classifyTalentLink", () => {
  it("active link shows as active", () => {
    expect(classifyTalentLink({ status: "active", ended_at: null, read_until: null, shared_docs: 0, now })).toBe("active");
  });
  it("invited (not accepted) link is hidden", () => {
    expect(classifyTalentLink({ status: "invited", ended_at: null, read_until: null, shared_docs: 0, now })).toBeNull();
  });
  it("ended link with shared documents shows as previously shared", () => {
    expect(
      classifyTalentLink({ status: "ended", ended_at: "2026-01-01", read_until: "2036-01-01", shared_docs: 3, now }),
    ).toBe("previous");
  });
  it("ended link with nothing shared is hidden", () => {
    expect(
      classifyTalentLink({ status: "ended", ended_at: "2026-01-01", read_until: "2036-01-01", shared_docs: 0, now }),
    ).toBeNull();
  });
  it("ended link past its read-only window is hidden", () => {
    expect(
      classifyTalentLink({ status: "ended", ended_at: "2015-01-01", read_until: "2025-01-01", shared_docs: 3, now }),
    ).toBeNull();
  });
  it("active status with a read-only date (offboarded agency) is not active", () => {
    expect(
      classifyTalentLink({ status: "active", ended_at: null, read_until: "2036-01-01", shared_docs: 1, now }),
    ).toBe("previous");
  });
});
