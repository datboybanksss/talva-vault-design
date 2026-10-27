import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { invitationDate } from "./invitation-display";
import { proofDocumentId } from "./proof-display";
import { agencyInvitationStatusInput } from "./invitation-status-input";
import { allQueryRows, checkRow, checkRows } from "./query-results";
import { parseLaunchSettings } from "./launch-reporting-core";
import { matchesSearch } from "./search";
import { reminderVisible } from "./connection-response";

const fixtures = vi.hoisted(() => ({
  context: {} as object,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: ((data: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: (data: unknown) => unknown) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (input: { context: object; data: unknown }) => unknown) =>
        (input: { data?: unknown } = {}) =>
          fn({ context: fixtures.context, data: validate ? validate(input.data) : input.data }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => undefined }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./terms-guard", () => ({ assertTermsAccepted: async () => undefined }));

import { listAgencyInvitationsMine, dismissAgencyReminder } from "./agency.functions";
import { listAgencyInvitationsPaged, listCombinedInvitations } from "./admin.functions";
import { northStarPairs } from "./admin-reporting.functions";

const requests: URL[] = [];
let failTable: string | null = null;
let dismissBody: unknown;
const invitation = {
  id: "invite", talent_name: "Test talent", email: "talent@example.test", status: "pending",
  token: "token", invited_by: null, last_sent_at: null, expires_at: "2099-01-01",
  send_count: 0, created_at: "2026-10-27",
};
const link = {
  id: "link", agency_id: "agency", talent_user_id: "talent", talent_invitation_id: "invite",
  display_name: "Test talent", created_at: "2026-10-01",
};
const client = createClient<Database>("https://database.example.test", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.split("/").pop();
      if (table === failTable) return new Response(JSON.stringify({ message: "read failed", code: "XX000" }), { status: 500 });
      let body: unknown = [];
      if (url.pathname.includes("/rpc/")) body = true;
      else if (table === "agency_members") body = { agency_id: "agency", role: "owner", suspended: false };
      else if (table === "talent_invitations") body = [invitation];
      else if (table === "agency_talent_links") body = [link];
      else if (table === "talent_audit_log") body = [{ actor_id: "talent", action: "login", created_at: "2026-10-27" }];
      else if (table === "agency_document_requests") body = [{ talent_link_id: "link", created_at: "2026-10-27", reviewed_at: null }];
      else if (table === "agency_notification_dismissals") {
        dismissBody = JSON.parse(String(init?.body));
        body = null;
      }
      // Search candidates contain a match beyond the former cap in each table.
      else if (table === "agency_invitations" || table === "independent_talent_invitations") {
        const isAgency = table === "agency_invitations";
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        const idFilter = url.searchParams.get("id");
        const rows = Array.from({ length: 5002 }, (_, i) => ({
          id: `${isAgency ? "agency" : "talent"}-${i}`,
          agency_name: i === 5001 ? "Café match" : "Other",
          contact_person: "Contact", talent_name: i === 5001 ? "Café match" : "Other",
          email: `${i}@example.test`, status: "draft", expires_at: "2099-01-01",
          created_at: isAgency ? "2026-10-27" : "2026-10-26", updated_at: "2026-10-27",
          agency_id: null, last_sent_at: null, send_count: 0, token: "token",
        }));
        const matching = idFilter ? rows.filter((r) => idFilter.includes(`"${r.id}"`)) : rows;
        body = matching.slice(offset, offset + limit);
        return new Response(init?.method === "HEAD" ? null : JSON.stringify(body), {
          headers: { "content-type": "application/json", "content-range": `0-0/${matching.length}` },
        });
      }
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    },
  },
});

beforeEach(() => {
  fixtures.context = { supabase: client, userId: "user", claims: {} };
  requests.length = 0;
  failTable = null;
  dismissBody = undefined;
});

describe("final approved clean-up fixes", () => {
  it("does not turn an unsent timestamp into 1 January 1970", () => {
    expect(invitationDate(null)).toBe("—");
    expect(invitationDate("2026-10-27T12:00:00Z")).toBe("27 Oct 2026");
  });
  it("returns the stored invitation status alongside the effective status", async () => {
    const rows = await listAgencyInvitationsMine();
    expect(rows[0]?.stored_status).toBe("pending");
    expect(rows[0]?.last_sent_at).toBeNull();
  });
  it("keeps paired dismissal keys and snapshots and reappears only when the count rises", async () => {
    await dismissAgencyReminder({ data: { kind: "attention_summary", snapshot: 2 } });
    expect(dismissBody).toMatchObject({ user_id: "user", kind: "attention_summary", snapshot: 2 });
    const dismissed = new Map([["attention_summary", 2]]);
    expect(reminderVisible("attention_summary", 2, dismissed)).toBe(false);
    expect(reminderVisible("attention_summary", 3, dismissed)).toBe(true);
    expect(reminderVisible(undefined, undefined, dismissed)).toBe(true);
  });
  it("finds matches beyond 5,000 for both types without changing merge order or page size", async () => {
    const result = await listCombinedInvitations({ data: { q: "cafe match", limit: 1, offset: 0 } });
    expect(result.total).toBe(2);
    expect(result.counts.agency.all).toBe(1);
    expect(result.counts.talent.all).toBe(1);
    expect(result.rows.map((r) => r.id)).toEqual(["agency-5001"]);
    const second = await listCombinedInvitations({ data: { q: "cafe match", limit: 1, offset: 1 } });
    expect(second.rows.map((r) => r.id)).toEqual(["talent-5001"]);
  });
  it("reads to exhaustion even when the server caps pages below the requested size", async () => {
    const candidates = Array.from({ length: 5002 }, (_, id) => ({ id, name: id === 5001 ? "Café" : "Other" }));
    const rows = await allQueryRows(async (from) => ({ data: candidates.slice(from, from + 750), error: null }));
    expect(rows.filter((r) => matchesSearch([r.name], "cafe")).map((r) => r.id)).toEqual([5001]);
    expect(rows).toHaveLength(5002);
  });
  it("accepts every generated invitation status and rejects unknown values before querying", async () => {
    for (const status of Constants.public.Enums.invitation_status) expect(agencyInvitationStatusInput.parse(status)).toBe(status);
    expect(agencyInvitationStatusInput.parse("all")).toBe("all");
    expect(() => listAgencyInvitationsPaged({ data: { status: "unknown" } })).toThrow(/Status/);
    expect(requests).toHaveLength(0);
  });
  it.each(["talent_invite_private", "agency_document_requests"])("refuses silently incorrect north-star figures when %s fails", async (table) => {
    failTable = table;
    await expect(northStarPairs(client, { fromIso: "2026-10-01", toIso: "2026-10-31" })).rejects.toThrow("We couldn't complete that request. Please try again.");
  });
  it("keeps successful north-star request attribution", async () => {
    const pairs = await northStarPairs(client, { fromIso: "2026-10-01", toIso: "2026-10-31" });
    expect(pairs[0]).toMatchObject({ both: true, agencyActions: ["document_request_created"], talentActions: ["login"] });
  });
  it("returns null for missing singleton settings and preserves existing settings/defaults", () => {
    const missing = checkRow<{ value: unknown; updated_at: string }>({ data: null, error: null });
    expect(missing).toBeNull();
    expect(parseLaunchSettings(missing?.value)).toBeNull();
    expect(missing?.updated_at ?? null).toBeNull();
    const row = { value: { launch_date: "2026-11-17" }, updated_at: "2026-10-27" };
    expect(checkRow({ data: row, error: null })).toBe(row);
    expect(checkRows({ data: null, error: null })).toEqual([]);
  });
  it("refuses failed search pages and singleton reads", async () => {
    const error = { message: "read failed", code: "XX000", details: "", hint: "", name: "PostgrestError" };
    await expect(allQueryRows(async () => ({ data: null, error }))).rejects.toThrow(/Please try again/);
    expect(() => checkRow({ data: null, error })).toThrow(/Please try again/);
  });
  it("renders a missing legacy document reference without throwing", () => {
    expect(proofDocumentId(null)).toBe("—");
    expect(proofDocumentId("12345678-1234-1234-1234-123456789012")).toBe("12345678");
  });
});