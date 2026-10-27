import { describe, expect, it } from "vitest";
import { profileName } from "./profile-name";
import { billingAccent, DEFAULT_BILLING_ACCENT } from "./billing-brand";
import { connectionResponseReminder, reminderVisible } from "./connection-response";
import { inviteActorArgs } from "./invite-actor";
import { billingOutstanding, isOutstandingInvoice } from "./billing";
import { buildBillingReport, type BillingReportRow } from "./billing-reports";

describe("approved type-clean-up bug fixes", () => {
  it("keeps a partial invoice outstanding, not paid, using its remaining balance", () => {
    const invoice: BillingReportRow = { id: "invoice", kind: "invoice", number: "I-1", client_name: null, talent_name: null, issued_at: "2026-10-27", due_date: "2026-11-27", currency: "ZAR", total_cents: 10000, received_cents: 2500, status: "partial" };
    const report = buildBillingReport([invoice], { key: "all", start: null, end: null, label: "All time" });
    expect(isOutstandingInvoice("partial")).toBe(true);
    expect(report.outstandingCents).toBe(7500);
    expect(report.receivedCount).toBe(0);
    expect(billingOutstanding(10000, 2500)).toBe(7500);
  });
  it("never counts a declined quote as an open invoice", () => {
    expect(isOutstandingInvoice("declined")).toBe(false);
    const report = buildBillingReport([{ id: "quote", kind: "quote", number: "Q-1", client_name: null, talent_name: null, issued_at: "2026-10-27", due_date: null, currency: "ZAR", total_cents: 10000, status: "declined" }], { key: "all", start: null, end: null, label: "All time" });
    expect(report.outstandingCount).toBe(0);
    expect(report.receivedCount).toBe(0);
  });
  it("resets a cleared billing colour to the existing default", () => {
    expect(billingAccent(null)).toBe("#064E58");
    expect(billingAccent(null)).toBe(DEFAULT_BILLING_ACCENT);
    expect(billingAccent("#123456")).toBe("#123456");
  });
  it("uses display name, then first and last name, then email for uploader and manager", () => {
    const profile = { display_name: "Display", first_name: "First", last_name: "Last", email: "name@example.test" };
    expect(profileName(profile)).toBe("Display");
    expect(profileName({ ...profile, display_name: null })).toBe("First Last");
    expect(profileName({ ...profile, display_name: null, first_name: null, last_name: null })).toBe("name@example.test");
    expect(profileName(null)).toBeNull();
  });
  it("includes private declined responses even while their public link remains invited", () => {
    const response = connectionResponseReminder({ id: "link", display_name: "Talent", status: "invited", declined_at: "2026-10-27" });
    expect(response.tone).toBe("amber");
    expect(response.title).toBe("Talent declined your connection request");
    expect(response.detail).toBe("No access has been granted. You can send a new request after 30 days.");
    expect(reminderVisible(response.key, response.snapshot, new Map())).toBe(true);
    expect(reminderVisible(response.key, response.snapshot, new Map([[response.key, 1]]))).toBe(false);
  });
  it("preserves accepted responses and their dismissal key", () => {
    const response = connectionResponseReminder({ id: "link", display_name: "Talent", status: "active", declined_at: null });
    expect(response.title).toBe("Talent accepted your connection request");
    expect(response.tone).toBe("green");
    expect(response.key).toBe("link_response:link");
    expect(reminderVisible(response.key, response.snapshot, new Map([[response.key, 1]]))).toBe(false);
  });
  it("uses the SQL null default for an absent actor email without replacing a present one", () => {
    expect(inviteActorArgs("invite", "actor", null)).toEqual({ _invitation_id: "invite", _actor: "actor" });
    expect(inviteActorArgs("invite", "actor", "")).toEqual({ _invitation_id: "invite", _actor: "actor", _actor_email: "" });
    expect(inviteActorArgs("invite", "actor", "actor@example.test")._actor_email).toBe("actor@example.test");
  });
});