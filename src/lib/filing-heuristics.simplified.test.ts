import { describe, expect, it } from "vitest";
import { suggestFromFileName } from "./filing-heuristics";

// Approved simplified agency shared folder structure (23 Oct 2026).
const catalog = [
  { id: "idp", label: "Identity & Personal → ID / Passport" },
  { id: "poa", label: "Identity & Personal → Proof of Address" },
  { id: "bank", label: "Banking, Tax & Financial → Bank Details & Confirmation" },
  { id: "tax", label: "Banking, Tax & Financial → Tax Documents" },
  { id: "visa", label: "Travel & Visas → Visas & Work Permits" },
];

describe("filename suggestions use the simplified structure", () => {
  it("passport goes to ID / Passport", () => {
    expect(suggestFromFileName("passport.pdf", catalog)?.folder_id).toBe("idp");
  });
  it("work permit goes to Visas & Work Permits", () => {
    expect(suggestFromFileName("work-permit.pdf", catalog)?.folder_id).toBe("visa");
  });
});
