import { describe, expect, it } from "vitest";
import { copyConfirmText, duplicateCopyMessage, isCopyTargetActive } from "@/lib/vault-copy-core";

describe("isCopyTargetActive", () => {
  it("allows an active, unended link", () => {
    expect(isCopyTargetActive({ status: "active", ended_at: null })).toBe(true);
  });
  it("refuses ended, read-only and non-active links", () => {
    expect(isCopyTargetActive({ status: "active", ended_at: "2026-01-01" })).toBe(false);
    expect(isCopyTargetActive({ status: "active", ended_at: null, read_until: "2031-01-01" })).toBe(
      false,
    );
    expect(isCopyTargetActive({ status: "invited", ended_at: null })).toBe(false);
    expect(isCopyTargetActive({ status: "revoked", ended_at: null })).toBe(false);
  });
});

describe("duplicateCopyMessage", () => {
  it("says the copy already exists and nothing was copied", () => {
    expect(duplicateCopyMessage("Passport.pdf", "Identity & Personal")).toBe(
      "A copy of Passport.pdf is already in Identity & Personal. Nothing was copied.",
    );
  });
});

describe("copyConfirmText", () => {
  it("states where the copy goes and that the original stays private", () => {
    expect(copyConfirmText("Passport.pdf", "Star Agency")).toBe(
      "A copy of Passport.pdf goes to your shared folder with Star Agency. The original stays private in your vault.",
    );
  });
});
