import { describe, expect, it } from "vitest";
import {
  INVITATION_STATUSES,
  normaliseInvitationStatus,
  normaliseInvitationType,
  statusOptionCounts,
  typeOptionCounts,
} from "./invitation-filters";

const counts = {
  agency: { all: 5, draft: 1, pending: 2, accepted: 2 },
  talent: { all: 3, draft: 2, pending: 1 },
};

describe("overview invitation filters", () => {
  it("offers exactly the stored invitation statuses plus derived expired", () => {
    expect(INVITATION_STATUSES.sort()).toEqual(
      ["accepted", "declined", "draft", "expired", "pending", "revoked"].sort(),
    );
  });
  it("falls back to all for unknown URL values", () => {
    expect(normaliseInvitationType("admin")).toBe("all");
    expect(normaliseInvitationStatus("archived")).toBe("all");
    expect(normaliseInvitationType("talent")).toBe("talent");
  });
  it("type counts follow the selected status", () => {
    expect(typeOptionCounts(counts, "draft")).toEqual({ all: 3, agency: 1, talent: 2 });
  });
  it("status counts follow the selected type", () => {
    expect(statusOptionCounts(counts, "talent").pending).toBe(1);
    expect(statusOptionCounts(counts, "all").pending).toBe(3);
  });
});
