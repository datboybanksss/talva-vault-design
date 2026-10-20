import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.SUPABASE_DB_URL)("live analysis read policy", () => {
  it("inherits document RLS rather than granting the uploader unconditional access", () => {
    const result = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-At"], {
      env: { ...process.env, PGDATABASE: process.env.SUPABASE_DB_URL },
      input: `SELECT json_build_object('roles',roles,'qual',qual,'cmd',cmd) FROM pg_policies
        WHERE schemaname='public' AND tablename='document_ai_analyses';`, encoding: "utf8",
    });
    if (result.status !== 0) throw new Error("Could not inspect live analysis read policy");
    const policies = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(policies).toHaveLength(1);
    expect(policies[0].roles).toEqual(["authenticated"]);
    expect(policies[0].cmd).toBe("SELECT");
    expect(policies[0].qual).toContain("talent_private_documents d");
    expect(policies[0].qual).toContain("talent_shared_documents d");
    expect(policies[0].qual).not.toContain("requested_by");
  });
  it("document readers retain the shared suspension and post-end helpers", () => {
    const result = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-At"], {
      env: { ...process.env, PGDATABASE: process.env.SUPABASE_DB_URL },
      input: `SELECT qual FROM pg_policies WHERE tablename='talent_shared_documents' AND cmd='SELECT';
        SELECT pg_get_functiondef('public.is_agency_member(uuid,uuid)'::regprocedure);
        SELECT pg_get_functiondef('public.talent_can_read_shared_doc(uuid,text,integer)'::regprocedure);`, encoding: "utf8",
    });
    if (result.status !== 0) throw new Error("Could not inspect document access rules");
    expect(result.stdout).toContain("can_access_talent_folder");
    expect(result.stdout).toContain("agency_staff_can_read");
    expect(result.stdout).toContain("talent_link_read_until");
  });
});
