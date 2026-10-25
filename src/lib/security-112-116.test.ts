import { describe, expect, it, vi } from "vitest";
import { invitationClaimError } from "./invite-claim-error";

describe("TVA-SEC-113 invitation claim failures", () => {
  it.each([
    { code: "42501", message: "permission denied for user_roles" },
    { code: "P0001", message: "secret trigger detail" },
    { message: "failed insert into agency_members" },
    { message: "failed insert into agencies" },
  ])("logs failure without returning its detail", (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(invitationClaimError(error)).toBe("We couldn't accept this invitation. Please try again or contact your administrator.");
    expect(log).toHaveBeenCalledWith("[invitation-claim] database failure", { code: error.code, message: error.message });
    log.mockRestore();
  });
});