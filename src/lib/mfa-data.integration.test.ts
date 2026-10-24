import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

// Opt-in real Data API regression. Supply only a dedicated Test account's
// two independently minted sessions; never check in credentials or tokens.
const sessionFile = process.env.MFA_TEST_SESSION_FILE;
describe.skipIf(!sessionFile)("TVA-SEC-101 direct Data API isolation", () => {
  function sessions() {
    if (!sessionFile) throw new Error("Dedicated Test sessions required");
    return JSON.parse(readFileSync(sessionFile, "utf8")) as {
      A: { access_token: string }; B: { access_token: string }; user: string;
    };
  }
  function client(token: string) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Test database configuration required");
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
  it("refuses password-only session B direct table reads", async () => {
    const d = sessions();
    const b = client(d.B.access_token);
    const status = await b.rpc("mfa_session_ok");
    expect(status.error).toBeNull();
    expect(status.data).toBe(false);
    const read = await b.from("talent_profiles").select("id").eq("user_id", d.user);
    expect(read.error?.message).toBe("MFA_REQUIRED");
  });
  it("allows session A after code verification without unlocking B", async () => {
    const d = sessions();
    const a = client(d.A.access_token);
    expect((await a.rpc("mfa_session_ok")).data).toBe(true);
    const read = await a.from("talent_profiles").select("id").eq("user_id", d.user);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);
    expect((await client(d.B.access_token).rpc("mfa_session_ok")).data).toBe(false);
  });
  it("refuses password-only SECURITY DEFINER RPCs", async () => {
    const d = sessions();
    const result = await client(d.B.access_token).rpc("my_link_requests");
    expect(result.error?.message).toBe("MFA_REQUIRED");
  });
});