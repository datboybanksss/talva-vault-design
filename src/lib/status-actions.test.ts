import { describe, expect, it } from "vitest";
import {
  agencyActions,
  canEndRelationship,
  canReactivateRelationship,
  invitationActions,
  shareIsLive,
  talentLinkActions,
} from "./status-actions";
import { statusLabel, statusPillClass } from "./status-labels";

const owner = { isOwner: true, writable: true };

describe("talent relationship actions (agency)", () => {
  it("invited → resend, revoke invite, copy link", () => {
    const a = talentLinkActions({ status: "invited", ...owner });
    expect(a).toEqual(expect.arrayContaining(["resend", "revoke", "copy_link"]));
    expect(a).not.toContain("end_relationship");
  });
  it("invited but past expiry → reinvite, no resend", () => {
    const a = talentLinkActions({ status: "invited", inviteInDate: false, ...owner });
    expect(a).toContain("reinvite");
    expect(a).not.toContain("resend");
  });
  it("expired → reinvite", () => {
    expect(talentLinkActions({ status: "expired", ...owner })).toContain("reinvite");
  });
  it("revoked → reinvite", () => {
    expect(talentLinkActions({ status: "revoked", ...owner })).toContain("reinvite");
  });
  it("active → end relationship (owner only)", () => {
    expect(talentLinkActions({ status: "active", ...owner })).toContain("end_relationship");
    expect(talentLinkActions({ status: "active", isOwner: false, writable: true })).not.toContain("end_relationship");
  });
  it("ended and read-only → reactivate directly", () => {
    expect(talentLinkActions({ status: "ended", ...owner })).toContain("reactivate");
    expect(talentLinkActions({ status: "read_only", ...owner })).toContain("reactivate");
  });
  it("suspended agency (not writable) gets no write actions", () => {
    for (const s of ["invited", "active", "ended", "expired"]) {
      expect(talentLinkActions({ status: s, isOwner: true, writable: false }).filter((x) => x !== "open" && x !== "copy_link")).toEqual([]);
    }
  });
  it("server transition rules", () => {
    expect(canEndRelationship("invited")).toBe(false);
    expect(canEndRelationship("active")).toBe(true);
    expect(canReactivateRelationship("active")).toBe(false);
    expect(canReactivateRelationship("ended")).toBe(true);
  });
});

describe("invitation actions", () => {
  it("pending → resend and revoke for admin and agency owner, copy only for staff", () => {
    expect(invitationActions({ status: "pending", viewer: "admin", canWrite: true })).toEqual(expect.arrayContaining(["resend", "revoke"]));
    expect(invitationActions({ status: "pending", viewer: "agency_owner", canWrite: true })).toEqual(expect.arrayContaining(["resend", "revoke"]));
    expect(invitationActions({ status: "pending", viewer: "agency_staff", canWrite: true })).toEqual(["copy_link"]);
  });
  it("expired, revoked and declined → reinvite", () => {
    for (const s of ["expired", "revoked", "declined"]) {
      expect(invitationActions({ status: s, viewer: "admin", canWrite: true })).toContain("reinvite");
      expect(invitationActions({ status: s, viewer: "agency_owner", canWrite: true })).toContain("reinvite");
    }
  });
  it("draft → continue draft for admins only", () => {
    expect(invitationActions({ status: "draft", viewer: "admin", canWrite: true })).toContain("continue_draft");
  });
});

describe("agency and share rules", () => {
  it("suspended agency → reinstate; otherwise suspend", () => {
    expect(agencyActions({ status: "suspended", canEdit: true })).toEqual(["reinstate"]);
    expect(agencyActions({ status: "accepted", canEdit: true })).toEqual(["suspend"]);
  });
  it("no new access code on revoked or expired shares", () => {
    expect(shareIsLive("revoked")).toBe(false);
    expect(shareIsLive("expired")).toBe(false);
    expect(shareIsLive("locked")).toBe(true);
  });
});

describe("shared status labels and colours", () => {
  it("Invited uses --st-invited, Expired uses --st-expired, Draft is neutral", () => {
    expect(statusPillClass("talentLink", "invited")).toBe("tvp-status st-invited");
    expect(statusPillClass("invitation", "expired")).toBe("tvp-status st-expired");
    expect(statusPillClass("invitation", "draft")).toBe("tvp-status st-neutral");
  });
  it("never shows raw values", () => {
    expect(statusLabel("talentLink", "read_only")).toBe("Read-only");
    expect(statusLabel("talentLink", "needs_review")).toBe("Needs review");
    expect(statusLabel("invitation", "pending")).toBe("Invited");
  });
});
