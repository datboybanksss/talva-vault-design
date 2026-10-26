import { describe, expect, it } from "vitest";
import { blockedReplacements, duplicateOnboardingName, onboardingPanelDocuments } from "./onboarding-documents";

const blocked = { id: "blocked", file_name: "ID.pdf", doc_slot: "id_document", quarantine_reason: "blocked_type", validated_at: null };
const valid = { ...blocked, id: "valid", quarantine_reason: null, validated_at: "2026-10-26T08:50:00Z" };

describe("onboarding corrected files", () => {
  it("ignores blocked names but still rejects an existing valid name", () => {
    expect(duplicateOnboardingName([blocked], "id.pdf")).toBe(false);
    expect(duplicateOnboardingName([valid], " id.PDF ")).toBe(true);
  });
  it("replaces only blocked files in the same slot with the same name", () => {
    expect(blockedReplacements([blocked, valid], "id_document", "id.pdf")).toEqual([blocked]);
    expect(blockedReplacements([blocked], "proof_of_talent", "id.pdf")).toEqual([]);
    expect(blockedReplacements([blocked], "id_document", "other.pdf")).toEqual([]);
  });
  it("retains blocked staged files after saving without showing attached staged duplicates", () => {
    expect(onboardingPanelDocuments([valid], [blocked, valid])).toEqual([valid, blocked]);
    expect(onboardingPanelDocuments(null, [blocked, valid])).toEqual([blocked, valid]);
    expect(onboardingPanelDocuments([], [blocked]).filter((row) => row.validated_at && !row.quarantine_reason)).toEqual([]);
  });
});