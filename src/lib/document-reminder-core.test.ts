import { describe, expect, it } from "vitest";
import { documentReminderDue, expiryPhrase, reminderLinkReadable } from "./document-reminder-core";
const now = Date.parse("2026-10-20T12:00:00Z");
describe("document reminders", () => {
  it("fires on the explicit reminder, not a future expiry", () => {
    expect(documentReminderDue("2026-12-01T00:00:00Z", "2026-10-20T09:00:00Z", 30, now)).toEqual({
      date: "2026-10-20T09:00:00Z",
      kind: "reminder",
    });
  });
  it("does not send before the configured reminder", () => {
    expect(documentReminderDue("2026-11-01T00:00:00Z", "2026-10-25T09:00:00Z", 30, now)).toBeNull();
  });
  it("fires on expiry even if its reminder was earlier", () => {
    expect(documentReminderDue("2026-10-20T00:00:00Z", "2026-10-01T09:00:00Z", 30, now)?.kind).toBe(
      "expiry",
    );
  });
  it("excludes long-expired documents and overdue standalone reminders", () => {
    expect(documentReminderDue("2020-01-01T00:00:00Z", null, 30, now)).toBeNull();
    expect(documentReminderDue(null, "2026-10-19T09:00:00Z", 30, now)).toBeNull();
  });
  it("uses the portal notice window when no explicit reminder exists", () => {
    expect(documentReminderDue("2026-11-10T00:00:00Z", null, 30, now)?.kind).toBe("expiry");
    expect(documentReminderDue("2026-12-10T00:00:00Z", null, 30, now)).toBeNull();
  });
  it("never describes a past date as a future expiry", () => {
    expect(expiryPhrase("2026-10-19T20:00:00Z", now)).toBe("expired 1 day ago");
    expect(expiryPhrase("2026-10-20T00:00:00Z", now)).toBe("expires today");
  });
  it("includes all current readable links but not ended links or expired access", () => {
    expect(reminderLinkReadable({ status: "active", ended_at: null }, null, now)).toBe(true);
    expect(reminderLinkReadable({ status: "read_only", ended_at: null }, "2027-01-01", now)).toBe(
      true,
    );
    expect(
      reminderLinkReadable({ status: "ended", ended_at: "2026-01-01" }, "2036-01-01", now),
    ).toBe(false);
    expect(reminderLinkReadable({ status: "active", ended_at: null }, "2026-01-01", now)).toBe(
      false,
    );
  });
});
