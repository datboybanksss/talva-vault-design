import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ bytes: "Safe plain text", removed: 0 }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { storage: { from: () => ({
  createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" }, error: null }),
  remove: async () => { state.removed++; return { error: null }; },
}) } } }));
import { validateStoredUpload } from "./file-validation.server";
beforeEach(() => {
  state.bytes = "Safe plain text"; state.removed = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(state.bytes, { headers: { "Content-Length": String(state.bytes.length) } })));
});
it("TVA-SEC-102 finalisation rejects an HTML claim and cleans the invalid object", async () => {
  await expect(validateStoredUpload({ bucket: "talent-private-documents", path: "owner/file", claimedMime: "text/html" })).rejects.toMatchObject({ code: "UPLOAD_TYPE_NOT_ALLOWED" });
  expect(state.removed).toBe(1);
});
it("TVA-SEC-102 successful CSV finalisation derives text/plain, not the claim", async () => {
  state.bytes = "name,value\nentry,10";
  const result = await validateStoredUpload({ bucket: "talent-private-documents", path: "owner/file", claimedMime: "text/csv" });
  expect(result.mimeType).toBe("text/plain; charset=utf-8");
  expect(state.removed).toBe(0);
});