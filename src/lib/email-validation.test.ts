import { describe, expect, it } from "vitest";
import { emailFromHeader, isValidEmail, stripEmailSeparators } from "./email-validation";

describe("bounded email validation", () => {
  for (const format of ["recipient", "agency", "administrator"] as const) {
    it(`${format} accepts a normal valid email`, () => {
      expect(isValidEmail(" lara@example.co.za ", format)).toBe(true);
    });
    it(`${format} rejects an invalid email`, () => {
      expect(isValidEmail("lara.example.co.za", format)).toBe(false);
    });
    it(`${format} rejects 10,000 adversarial characters promptly`, () => {
      const start = performance.now();
      expect(isValidEmail("@".repeat(10_000), format)).toBe(false);
      expect(performance.now() - start).toBeLessThan(100);
    });
  }

  it("preserves the different existing normal-address rules", () => {
    expect(isValidEmail("a@b.c", "recipient")).toBe(false);
    expect(isValidEmail("a@b.c", "agency")).toBe(true);
    expect(isValidEmail("a b@c.d", "administrator")).toBe(true);
    expect(isValidEmail("a@@b.cd", "recipient")).toBe(false);
  });
});

describe("linear email header extraction", () => {
  it("extracts a valid address", () => {
    expect(emailFromHeader("Lara <lara@example.co.za>")).toBe("lara@example.co.za");
  });
  it("keeps an invalid unwrapped header for existing caller validation", () => {
    expect(emailFromHeader(" invalid ")).toBe("invalid");
    expect(emailFromHeader("<> <a@b.co>")).toBe("a@b.co");
  });
  it("handles 10,000 unmatched brackets promptly", () => {
    const value = "<".repeat(10_000);
    const start = performance.now();
    expect(emailFromHeader(value)).toBe(value);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("linear chip suffix removal", () => {
  it("preserves a valid address while removing delimiters", () => {
    expect(stripEmailSeparators("lara@example.co.za,;")).toBe("lara@example.co.za");
  });
  it("does not make an invalid email valid", () => {
    expect(isValidEmail(stripEmailSeparators("not-an-email,;"))).toBe(false);
  });
  it("handles a 10,000-character adversarial suffix promptly", () => {
    const start = performance.now();
    expect(stripEmailSeparators(";".repeat(9_999) + "x")).toHaveLength(10_000);
    expect(stripEmailSeparators(";".repeat(10_000))).toBe("");
    expect(performance.now() - start).toBeLessThan(100);
  });
});