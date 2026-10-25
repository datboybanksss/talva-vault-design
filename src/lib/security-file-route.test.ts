import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ hash: "hash" as string | null, validated: "2026-10-25T00:00:00Z" as string | null, downloads: 0 }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@/lib/loved-one-access.server", () => ({ verifyTicket: () => true }));
vi.mock("@/lib/loved-one.functions", () => ({ resolveShareFolders: async () => ({ folderIds: [] }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "loved_one_shares" ? {
      id: "share", scope: { private_document_ids: ["doc"] }, created_by: "owner", expires_at: "2099-01-01T00:00:00Z", access_code_hash: state.hash, permission: "download", is_active: true,
    } : { id: "doc", name: "legacy.svg", folder_id: null, storage_path: "owner/file.svg", user_id: "owner", mime_type: "image/svg+xml", validated_at: state.validated }, error: null }) };
    return q;
  },
  storage: { from: () => ({ download: async () => { state.downloads++; return { data: new Blob(["svg"]), error: null }; } }) },
} }));
import { Route } from "@/routes/api/public/loved-one-file";
const handler = (Route as unknown as { server: { handlers: { GET: (input: { request: Request }) => Promise<Response> } } }).server.handlers.GET;
const request = () => new Request("https://example.test/api/public/loved-one-file?token=token&doc=doc&ticket=ticket");
beforeEach(() => { state.hash = "hash"; state.validated = "2026-10-25T00:00:00Z"; state.downloads = 0; });
it("TVA-SEC-103 a share without a code hash cannot serve files", async () => {
  state.hash = null;
  expect((await handler({ request: request() })).status).toBe(401);
  expect(state.downloads).toBe(0);
});
it("TVA-SEC-102 an unfinalised document is never fetched or served", async () => {
  state.validated = null;
  expect((await handler({ request: request() })).status).toBe(404);
  expect(state.downloads).toBe(0);
});
it("TVA-SEC-102 legacy SVG is an attachment with sandbox and nosniff", async () => {
  const response = await handler({ request: request() });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
  expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox;");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
});