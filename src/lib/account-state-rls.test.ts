import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Live database checks, run inside a transaction that is always rolled back:
 * nothing is changed. Picks a real talent with Private Vault documents and a
 * real agency staff member whose agency holds shared documents.
 */
function runAs(sql: string): string {
  const result = spawnSync("psql", [process.env.SUPABASE_DB_URL ?? "", "-v", "ON_ERROR_STOP=1", "-At", "-q"], {
    input: sql,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || "psql failed");
  return result.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
}

const TALENT = `(SELECT t.user_id FROM public.talent_profiles t
  WHERE t.user_id IS NOT NULL AND t.deleted_at IS NULL
    AND NOT public.has_role(t.user_id, 'admin')
    AND EXISTS (SELECT 1 FROM public.talent_private_documents d WHERE d.user_id = t.user_id)
  ORDER BY t.created_at LIMIT 1)`;
const STAFF = `(SELECT m.user_id FROM public.agency_members m
  WHERE NOT public.has_role(m.user_id, 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.talent_profiles t WHERE t.user_id = m.user_id)
    AND EXISTS (SELECT 1 FROM public.talent_shared_documents d WHERE d.agency_id = m.agency_id)
  ORDER BY m.created_at LIMIT 1)`;

const actAs = (who: string) => `
  SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT u FROM pick), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;`;

describe.skipIf(!process.env.SUPABASE_DB_URL)("live: pause and suspend enforced in the database", () => {
  it("a paused talent can read nothing; unpausing restores the same rows", () => {
    const out = runAs(`
      BEGIN;
      CREATE TEMP TABLE pick AS SELECT ${TALENT} AS u; GRANT SELECT ON pick TO authenticated;
      ${actAs("talent")}
      CREATE TEMP TABLE r(before int, paused int, after int); 
      INSERT INTO r(before) SELECT count(*) FROM public.talent_private_documents;
      RESET ROLE;
      UPDATE public.talent_profiles SET paused_at = now() WHERE user_id = (SELECT u FROM pick);
      SET LOCAL ROLE authenticated;
      UPDATE r SET paused = (SELECT count(*) FROM public.talent_private_documents);
      RESET ROLE;
      UPDATE public.talent_profiles SET paused_at = NULL WHERE user_id = (SELECT u FROM pick);
      SET LOCAL ROLE authenticated;
      UPDATE r SET after = (SELECT count(*) FROM public.talent_private_documents);
      SELECT json_build_object('before', before, 'paused', paused, 'after', after) FROM r;
      ROLLBACK;`);
    const r = JSON.parse(out);
    expect(r.before).toBeGreaterThan(0);
    expect(r.paused).toBe(0);
    expect(r.after).toBe(r.before);
  });

  it("a suspended talent can still read but can't add anything", () => {
    const out = runAs(`
      BEGIN;
      CREATE TEMP TABLE pick AS SELECT ${TALENT} AS u; GRANT SELECT ON pick TO authenticated;
      UPDATE public.talent_profiles SET suspended_at = now() WHERE user_id = (SELECT u FROM pick);
      ${actAs("talent")}
      CREATE TEMP TABLE r(readable int, write_blocked boolean);
      INSERT INTO r(readable) SELECT count(*) FROM public.talent_private_documents;
      DO $$ BEGIN
        INSERT INTO public.talent_private_folders(user_id, name) VALUES ((SELECT u FROM pick), 'rls-check');
        UPDATE r SET write_blocked = false;
      EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
        UPDATE r SET write_blocked = true;
      END $$;
      SELECT json_build_object('readable', readable, 'write_blocked', write_blocked) FROM r;
      ROLLBACK;`);
    const r = JSON.parse(out);
    expect(r.readable).toBeGreaterThan(0);
    expect(r.write_blocked).toBe(true);
  });

  it("staff of a paused agency can read nothing", () => {
    const out = runAs(`
      BEGIN;
      CREATE TEMP TABLE pick AS SELECT ${STAFF} AS u; GRANT SELECT ON pick TO authenticated;
      ${actAs("staff")}
      CREATE TEMP TABLE r(before int, paused int);
      INSERT INTO r(before) SELECT count(*) FROM public.talent_shared_documents;
      RESET ROLE;
      UPDATE public.agencies SET paused_at = now()
       WHERE id IN (SELECT agency_id FROM public.agency_members WHERE user_id = (SELECT u FROM pick));
      SET LOCAL ROLE authenticated;
      UPDATE r SET paused = (SELECT count(*) FROM public.talent_shared_documents);
      SELECT json_build_object('before', before, 'paused', paused) FROM r;
      ROLLBACK;`);
    const r = JSON.parse(out);
    expect(r.before).toBeGreaterThan(0);
    expect(r.paused).toBe(0);
  });

  it("only an administrator can change pause or suspension details", () => {
    const out = runAs(`
      BEGIN;
      CREATE TEMP TABLE pick AS SELECT ${TALENT} AS u; GRANT SELECT ON pick TO authenticated;
      CREATE TEMP TABLE r(blocked boolean); GRANT ALL ON r TO authenticated;
      ${actAs("talent")}
      DO $$ BEGIN
        UPDATE public.talent_profiles SET suspended_at = now() WHERE user_id = (SELECT u FROM pick);
        INSERT INTO r VALUES (false);
      EXCEPTION WHEN others THEN INSERT INTO r VALUES (true);
      END $$;
      SELECT json_build_object('blocked', blocked) FROM r;
      ROLLBACK;`);
    expect(JSON.parse(out).blocked).toBe(true);
  });
});
