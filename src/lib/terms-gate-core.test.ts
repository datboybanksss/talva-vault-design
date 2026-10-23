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
import { termsGateView } from "./terms-gate-core";
describe("termsGateView (three states)", () => {
  it("loading never shows the gate", () => {
    expect(termsGateView({ isPending: true, isError: false, data: undefined })).toBe("loading");
  });
  it("a failed check is an error, not the gate", () => {
    expect(termsGateView({ isPending: false, isError: true, data: undefined })).toBe("error");
  });
  it("accepted user passes", () => {
    expect(termsGateView({ isPending: false, isError: false, data: { required: false, current: {} } })).toBe("accepted");
  });
  it("only a confirmed 'required' shows the gate", () => {
    expect(termsGateView({ isPending: false, isError: false, data: { required: true, current: {} } })).toBe("needs_acceptance");
  });
  it("keeps the last confirmed answer while refetching in the background", () => {
    expect(termsGateView({ isPending: false, isError: true, data: { required: false, current: {} } })).toBe("accepted");
  });
});

import { testUserIds } from "./terms-gate-core";
describe("testUserIds", () => {
  it("includes Test talent and every member of a Test agency, nobody else", () => {
    const ids = testUserIds(
      [{ user_id: "t1", is_test: true }, { user_id: "t2", is_test: false }],
      [{ user_id: "o1", agency_id: "A" }, { user_id: "s1", agency_id: "A" }, { user_id: "r1", agency_id: "B" }],
      ["A"],
    );
    expect([...ids].sort()).toEqual(["o1", "s1", "t1"]);
  });
});
