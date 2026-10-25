import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; op: string; args: unknown[] }[] = [];
let stagedRows: any[] = [];

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const b: any = {
    select: () => b,
    eq: (col: string, v: unknown) => ((filters[col] = v), b),
    not: () => b,
    order: () =>
      Promise.resolve({
        data: stagedRows.filter(
          (r) => r.admin_id === filters.admin_id && r.session_id === filters.session_id && r.kind === filters.kind && r.validated_at,
        ),
        error: null,
      }),
    insert: (rows: unknown) => (calls.push({ table, op: "insert", args: [rows] }), Promise.resolve({ error: null })),
    delete: () => ({ in: (_c: string, ids: unknown) => (calls.push({ table, op: "delete", args: [ids] }), Promise.resolve({ error: null })) }),
  };
  return b;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => builder(t) } }));

import { attachStagedUploads, stagedPathOwned, stagingPrefix } from "./onboarding-staging.server";
import { QUARANTINE_LABEL, quarantineReason } from "./document-quarantine";

const adminA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const adminB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const session = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const row = (admin: string, extra: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  admin_id: admin,
  session_id: session,
  kind: "talent",
  doc_slot: "id_document",
  file_name: "id.pdf",
  storage_path: `${stagingPrefix(admin, session)}id_document/1-id.pdf`,
  mime_type: "application/pdf",
  size_bytes: 10,
  validated_at: "2026-10-25T10:00:00Z",
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  stagedRows = [];
});

describe("staged onboarding uploads", () => {
  it("upload before saving, then save: the admin's files are attached to the new draft", async () => {
    stagedRows = [row(adminA)];
    const n = await attachStagedUploads(adminA, session, { kind: "talent", invitationId: "inv-1" });
    expect(n).toBe(1);
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.table).toBe("talent_invitation_documents");
    expect((insert.args[0] as any[])[0]).toMatchObject({ invitation_id: "inv-1", doc_slot: "id_document", uploaded_by: adminA });
    expect(calls.some((c) => c.op === "delete" && c.table === "onboarding_staged_uploads")).toBe(true);
  });

  it("agency files carry the agency and business type", async () => {
    stagedRows = [row(adminA, { kind: "agency", doc_slot: "cipc" })];
    await attachStagedUploads(adminA, session, { kind: "agency", invitationId: "inv-2", agencyId: "ag-1", businessType: "formal" });
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.table).toBe("agency_compliance_documents");
    expect((insert.args[0] as any[])[0]).toMatchObject({ agency_id: "ag-1", business_type: "formal", invitation_id: "inv-2" });
  });

  it("another admin can't attach someone else's staged files", async () => {
    stagedRows = [row(adminA)];
    const n = await attachStagedUploads(adminB, session, { kind: "talent", invitationId: "inv-3" });
    expect(n).toBe(0);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("a file outside the admin's own staging folder is never attached", async () => {
    stagedRows = [row(adminA, { storage_path: `${stagingPrefix(adminB, session)}x.pdf` })];
    expect(await attachStagedUploads(adminA, session, { kind: "talent", invitationId: "inv-4" })).toBe(0);
    expect(stagedPathOwned(`${stagingPrefix(adminA, session)}../x.pdf`, adminA, session)).toBe(false);
  });

  it("blocked staged files show Blocked for security and are not attached", async () => {
    const blocked = row(adminA, { validated_at: null, quarantine_reason: "blocked_type" });
    stagedRows = [blocked];
    expect(quarantineReason(blocked)).toBe("blocked_type");
    expect(QUARANTINE_LABEL).toBe("Blocked for security");
    expect(await attachStagedUploads(adminA, session, { kind: "talent", invitationId: "inv-5" })).toBe(0);
  });
});
