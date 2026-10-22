import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("hides raw Zod validation JSON", () => {
    const zod = new Error('[{"validation":"uuid","code":"invalid_string","message":"Invalid uuid","path":["document_id"]}]');
    expect(friendlyError(zod, "We couldn't save that.")).toBe("We couldn't save that.");
  });
  it("hides database errors", () => {
    expect(friendlyError(new Error('new row violates row-level security policy for table "x"'))).toBe(
      "Something went wrong. Please try again.",
    );
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
});
