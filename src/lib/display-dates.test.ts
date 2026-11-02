import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime } from "@/lib/display-dates";

describe("display dates", () => {
  it("formats a date as 29 Oct 2026", () => {
    expect(fmtDate("2026-10-29T10:00:00Z")).toBe("29 Oct 2026");
  });
  it("uses Sep, not Sept", () => {
    expect(fmtDate("2026-09-18T10:00:00Z")).toBe("18 Sep 2026");
  });
  it("formats a date-time in SAST", () => {
    expect(fmtDateTime("2027-05-15T12:32:00Z")).toBe("15 May 2027, 14:32 SAST");
  });
  it("uses the South African day near midnight", () => {
    expect(fmtDate("2026-10-28T23:30:00Z")).toBe("29 Oct 2026");
  });
  it("never renders Invalid Date", () => {
    expect(fmtDate("not a date")).toBe("—");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDateTime(undefined, "")).toBe("");
  });
});
