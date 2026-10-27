import { describe, expect, it } from "vitest";
import { publicFunctionError } from "./public-function-error";

describe("public function errors", () => {
  it("keeps stable refusal codes and their friendly sentence", () => {
    expect(publicFunctionError(new Error("DOCUMENT_BLOCKED_TYPE: This file type isn't supported.")).message).toBe("DOCUMENT_BLOCKED_TYPE: This file type isn't supported.");
    expect(publicFunctionError(new Error("MFA_REQUIRED")).message).toMatch(/^MFA_REQUIRED:/);
  });
  it("never forwards database detail", () => {
    expect(publicFunctionError(new Error("new row violates row-level security policy for relation private")).message).toBe("You don't have permission to do that.");
  });
});