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

describe("invitation totals add up", () => {
  // Shape of the live data on 22 Oct 2026: agency onboarding invitations only.
  const live = {
    agency: { all: 13, draft: 0, pending: 0, expired: 6, accepted: 6, declined: 0, revoked: 1 },
    talent: { all: 0, draft: 0, pending: 0, expired: 0, accepted: 0, declined: 0, revoked: 0 },
  };
  it("All types equals Agency plus Talent for every status", () => {
    for (const s of ["all", ...INVITATION_STATUSES]) {
      const t = typeOptionCounts(live, s);
      expect(t.all).toBe(t.agency + t.talent);
    }
  });
  it("All statuses equals the sum of every status option, for every type", () => {
    for (const type of ["all", "agency", "talent"] as const) {
      const c = statusOptionCounts(live, type);
      const sum = INVITATION_STATUSES.reduce((n, s) => n + (c[s] ?? 0), 0);
      expect(c.all).toBe(sum);
    }
    expect(statusOptionCounts(live, "all").all).toBe(13);
  });
});
