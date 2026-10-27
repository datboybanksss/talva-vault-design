import { describe, expect, it } from "vitest";
import { adultBirthDate, validBirthDate, talentOnboardingSlotAllowed } from "./talent-registration-core";

describe("talent registration privacy", () => {
  const today = new Date("2026-10-27T12:00:00Z");
  it("requires age 18 as of today's UTC date", () => {
    expect(adultBirthDate("2008-10-27", today)).toBe(true);
    expect(adultBirthDate("2008-10-28", today)).toBe(false);
  });
  it("rejects impossible and future dates", () => {
    expect(validBirthDate("2000-02-30", today)).toBe(false);
    expect(validBirthDate("2027-01-01", today)).toBe(false);
    expect(validBirthDate("2000-02-29", today)).toBe(true);
  });
  it("allows only proof of talent in talent onboarding", () => {
    expect(talentOnboardingSlotAllowed("talent", "proof_of_talent")).toBe(true);
    expect(talentOnboardingSlotAllowed("talent", "id_document")).toBe(false);
  });
  it("preserves agency ID-copy onboarding", () => {
    expect(talentOnboardingSlotAllowed("agency", "id_document")).toBe(true);
  });
});