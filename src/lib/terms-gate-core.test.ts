import { describe, expect, it } from "vitest";
import { acceptTermsInput, reachedDocumentEnd, termsGateError } from "./terms-gate-core";

describe("Terms acceptance rules", () => {
  it.each([
    ["agency", "2908166d-8ecf-42f7-94bd-f0752084a87b"],
    ["talent", "316ca0dc-a390-4525-b444-0729118bf4bb"],
  ])("accepts the actual current %s UUID", (portal, document_id) => {
    expect(acceptTermsInput.parse({ portal, document_id, body_sha256: "a".repeat(64) }).document_id).toBe(document_id);
  });
  it("continues rejecting non-UUID document identifiers", () => {
    expect(acceptTermsInput.safeParse({ portal: "agency", document_id: "agency-v1.1", body_sha256: "a".repeat(64) }).success).toBe(false);
  });
  it("requires a displayed exact-body hash", () => {
    expect(acceptTermsInput.safeParse({ portal: "agency", document_id: "2908166d-8ecf-42f7-94bd-f0752084a87b" }).success).toBe(false);
  });
  it("does not unlock agreement before the document end", () => {
    expect(reachedDocumentEnd(0, 380, 1800)).toBe(false);
    expect(reachedDocumentEnd(1419, 380, 1800)).toBe(false);
    expect(reachedDocumentEnd(1420, 380, 1800)).toBe(true);
  });
  it("unlocks a fully visible short document but not an unmeasured panel", () => {
    expect(reachedDocumentEnd(0, 380, 100)).toBe(true);
    expect(reachedDocumentEnd(0, 0, 0)).toBe(false);
  });
  it("does not expose raw validation details", () => {
    expect(termsGateError(new Error('[{"validation":"uuid","code":"invalid_string","path":["document_id"]}]'))).toBe("We couldn't verify this Terms document. Please reload the page and try again.");
  });
});