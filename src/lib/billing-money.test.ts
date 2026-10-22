import { describe, expect, it } from "vitest";
import { fmtMoney } from "./billing";

const nb = (s: string) => s.replace(/\u00a0/g, " ");

describe("rand amounts", () => {
  it("use space thousands and comma decimals", () => {
    expect(nb(fmtMoney(1250000))).toBe("R 12 500,00");
    expect(nb(fmtMoney(28584400))).toBe("R 285 844,00");
    expect(nb(fmtMoney(5))).toBe("R 0,05");
    expect(nb(fmtMoney(0))).toBe("R 0,00");
  });
  it("show negatives with a leading minus", () => {
    expect(nb(fmtMoney(-150000))).toBe("-R 1 500,00");
  });
});
