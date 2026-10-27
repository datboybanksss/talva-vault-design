import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("hides raw Zod validation JSON", () => {
    const zod = new Error(
      '[{"validation":"uuid","code":"invalid_string","message":"Invalid uuid","path":["document_id"]}]',
    );
    expect(friendlyError(zod, "We couldn't save that.")).toBe("We couldn't save that.");
  });
  it("hides database errors", () => {
    expect(
      friendlyError(new Error('new row violates row-level security policy for table "x"')),
    ).toBe("You don't have permission to do that.");
  });
  it("maps the Terms code to a plain sentence", () => {
    expect(friendlyError(new Error("TERMS_NOT_ACCEPTED: please accept"))).toBe(
      "Please accept the current Terms & Conditions to continue.",
    );
  });
  it("keeps plain messages written for users", () => {
    expect(friendlyError(new Error("This invitation has already been accepted."))).toBe(
      "This invitation has already been accepted.",
    );
  });
  it("uses the fallback when there is no message", () => {
    expect(friendlyError(undefined, "Upload failed")).toBe("Upload failed");
  });
  it.each([
    [
      { code: "42501", message: "permission denied for relation private" },
      "You don't have permission to do that.",
    ],
    [
      { code: "23505", message: "duplicate key violates unique constraint secret" },
      "That already exists.",
    ],
    [
      { code: "23503", message: "foreign key constraint" },
      "We couldn't save that. Please check the details and try again.",
    ],
    [
      { code: "23502", message: "null value in column name" },
      "We couldn't save that. Please check the details and try again.",
    ],
    [
      { code: "23514", message: "check violation" },
      "We couldn't save that. Please check the details and try again.",
    ],
    [new Error("network timeout"), "We couldn't connect. Please try again."],
    [new Error("PGRST204: missing column internal"), "Something went wrong. Please try again."],
    [new Error("SQLSTATE XX000 relation internal"), "Something went wrong. Please try again."],
    [
      new Error("Error: stack at handler (/app/server.ts:12:4)"),
      "Something went wrong. Please try again.",
    ],
  ])("redacts internals from %j", (input, expected) => {
    const output = friendlyError(input);
    expect(output).toBe(expected);
    expect(output).not.toMatch(
      /row-level security|violates|constraint|relation|column|duplicate key|PGRST|SQLSTATE|\b(?:22|23|28|40|42|XX)[0-9A-Z]{3}\b|stack|:\d+:\d+/i,
    );
  });
});
