import { describe, expect, it } from "vitest";
import { agencyDocumentChangeBlock, agencyDocumentDeleteBlock, blockText } from "./document-blocks";
import { friendlyError } from "./friendly-error";

const now = new Date("2026-10-22T12:00:00Z");
const base = {
  originator: "agency",
  talentName: "Naledi Khumalo",
  lockedUntil: null as string | null,
  linkStatus: "active",
  agencyReadOnly: false,
};

/** What the user actually sees for a blocked delete (menu text = toast text). */
const shown = (facts: typeof base) => {
  const b = agencyDocumentDeleteBlock(facts, now);
  return b ? friendlyError(new Error(blockText(b)), "generic") : null;
};

describe("blocked agency document delete shows the reason", () => {
  it("allows an ordinary agency document", () => {
    expect(shown(base)).toBeNull();
  });
  it("talent's own document: names the talent, no workaround", () => {
    expect(shown({ ...base, originator: "talent" })).toBe(
      "Naledi Khumalo shared this document with you, so only they can delete it.",
    );
  });
  it("retention period: gives the end date", () => {
    expect(shown({ ...base, lockedUntil: "2031-03-12T00:00:00Z" })).toBe(
      "This document is under a retention period until 12 March 2031, so it can't be deleted.",
    );
  });
  it("an expired retention period no longer blocks", () => {
    expect(shown({ ...base, lockedUntil: "2026-01-01T00:00:00Z" })).toBeNull();
  });
  it("ended relationship: says who, and that an owner can reactivate", () => {
    expect(shown({ ...base, linkStatus: "ended" })).toBe(
      "Your relationship with Naledi Khumalo has ended, so this document is view and download only. An agency owner can reactivate the relationship to make changes.",
    );
  });
  it("read-only (suspended) agency wins over every other reason", () => {
    expect(shown({ ...base, agencyReadOnly: true, originator: "talent" })).toBe(
      "Your agency account is read-only, so documents can't be deleted.",
    );
  });
  it("retention doesn't block uploading a new version", () => {
    expect(
      agencyDocumentChangeBlock({ ...base, lockedUntil: "2031-03-12T00:00:00Z" }, "changed", now),
    ).toBeNull();
  });
});

describe("friendlyError keeps refusal reasons", () => {
  it("strips a machine code but keeps the sentence", () => {
    expect(friendlyError(new Error("RETENTION_LOCKED: document is locked until 2031"), "x")).toBe(
      "Document is locked until 2031",
    );
  });
  it("still hides database errors", () => {
    expect(friendlyError(new Error("new row violates row-level security policy"), "x")).toBe("x");
  });
});
