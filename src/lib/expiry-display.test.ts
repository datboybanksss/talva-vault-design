import { describe, expect, it } from "vitest";
import { effectiveInvitationStatus, withEffectiveStatus } from "./invitation-status";

describe("expired invitations are shown as Expired without changing stored data", () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it("a pending invitation past its expiry date reads as expired", () => {
    expect(effectiveInvitationStatus("pending", past)).toBe("expired");
  });
  it("keeps the stored status so claim flows still give their expired message", () => {
    const row = withEffectiveStatus({ status: "pending", expires_at: past });
    expect(row.status).toBe("expired");
    expect(row.stored_status).toBe("pending");
  });
  it("an unexpired pending invitation stays pending; accepted stays accepted", () => {
    expect(effectiveInvitationStatus("pending", future)).toBe("pending");
    expect(effectiveInvitationStatus("accepted", past)).toBe("accepted");
  });
});
