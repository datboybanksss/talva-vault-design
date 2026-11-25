import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { reportsDbFixture } from "./reports-db.fixture";
import { REPORT_ROLES, REPORT_PERMISSIONS, roleCan } from "./reports-contract";

// Installed functions are copied onto temporary data and rolled back; no sessions/accounts/settings change.
const authFixture = `
ALTER TABLE pg_temp.user_roles ADD suspended boolean DEFAULT false;
CREATE TEMP TABLE reports_access(user_id uuid PRIMARY KEY,role text,updated_at timestamptz);
CREATE TEMP TABLE admin_audit_log(actor_id uuid,action text,target_type text,target_id text,detail jsonb);
INSERT INTO reports_access VALUES ('00000000-0000-4000-8000-000000000006','owner',now());
CREATE OR REPLACE FUNCTION pg_temp.account_ok(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('reports.account',true),'ok')<>'blocked' $$;
DO $$ DECLARE n text; d text; t text; BEGIN
FOREACH n IN ARRAY ARRAY['reports_can(text)','reports_people_page(date,date,jsonb,integer,integer,text,text,boolean,timestamptz,boolean)','reports_access_guard()','reports_set_access(uuid,text)'] LOOP
 d:=pg_get_functiondef(('public.'||n)::regprocedure);
 d:=replace(d,'auth.uid()','pg_temp.uid()');
 d:=replace(d,'public.has_role','pg_temp.is_admin');
 d:=replace(d,'public.account_read_allowed','pg_temp.account_ok');
 d:=replace(d,'public.mfa_session_ok()','pg_temp.mfa_ok()');
 FOREACH t IN ARRAY ARRAY['reports_can','reports_people_page','reports_people_rows','reports_access_guard','reports_set_access','reports_access','user_roles','admin_audit_log'] LOOP d:=replace(d,'public.'||t,'pg_temp.'||t); END LOOP;
 EXECUTE d;
END LOOP; END $$;
CREATE TRIGGER reports_access_guard BEFORE INSERT OR UPDATE OR DELETE ON pg_temp.reports_access FOR EACH ROW EXECUTE FUNCTION pg_temp.reports_access_guard();
DO $$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true); END $$;
`;
function run(sql: string) {
  const r = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: `BEGIN;${reportsDbFixture}${authFixture}${sql}ROLLBACK;`,
    encoding: "utf8",
    timeout: 20000,
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim().split("\n");
}
// Configure fixtures before entering caller context, not via a real access update.
function roleSetup(role: string) {
  return `ALTER TABLE pg_temp.reports_access DISABLE TRIGGER reports_access_guard; UPDATE pg_temp.reports_access SET role='${role}'; ALTER TABLE pg_temp.reports_access ENABLE TRIGGER reports_access_guard;`;
}
const filters = `' {"accounts":"all","account_type":"all","talent":"all","source":"all","status":"any","agencies":[],"stage":"all","activity":"all","people":[]} '::jsonb`;
const peoplePage = (emails: boolean, download: boolean) =>
  `pg_temp.reports_people_page('2026-10-01','2026-10-31',${filters},25,0,'name','asc',${emails},'2026-11-02',${download})`;
const refuse = (sql: string) =>
  `DO $$ BEGIN ${sql}; RAISE EXCEPTION 'permission unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$; SELECT 'refused';`;
describe.skipIf(!process.env["PGHOST"])("Reports-only direct database permissions", () => {
  it.each(REPORT_ROLES)("enforces the exact %s permission matrix from installed SQL", (role) => {
    const rows = run(
      roleSetup(role) +
        REPORT_PERMISSIONS.map((p) => `SELECT pg_temp.reports_can('${p}');`).join(""),
    );
    expect(rows).toEqual(REPORT_PERMISSIONS.map((p) => (roleCan(role, p) ? "t" : "f")));
  });
  it("unknown permissions are denied", () =>
    expect(run("SELECT pg_temp.reports_can('unknown');")).toEqual(["f"]));
  it.each([
    `SELECT set_config('request.jwt.claims','{}',true);`,
    `SELECT set_config('metering.admin','no',true);`,
    `SELECT set_config('reports.account','blocked',true);`,
    `SELECT set_config('metering.mfa','blocked',true);`,
  ])("denies signed-out/non-admin/account/MFA blocked callers: %s", (setup) => {
    expect(run(setup + "SELECT pg_temp.reports_can('view_reports');").at(-1)).toBe("f");
  });
  it("Viewer can browse People but cannot download", () => {
    expect(
      run(
        roleSetup("viewer") + `SELECT jsonb_array_length(${peoplePage(false, false)}->'rows')>0;`,
      ),
    ).toEqual(["t"]);
    expect(run(roleSetup("viewer") + refuse(`PERFORM ${peoplePage(false, true)}`))).toEqual([
      "refused",
    ]);
  });
  it.each(["operations", "analyst"])("%s may download but cannot request emails", (role) => {
    expect(
      run(roleSetup(role) + `SELECT ${peoplePage(false, true)}#>>'{rows,0,email}' IS NULL;`),
    ).toEqual(["t"]);
    expect(run(roleSetup(role) + refuse(`PERFORM ${peoplePage(true, true)}`))).toEqual(["refused"]);
  });
  it("Owner gets emails only after explicit inclusion", () => {
    expect(
      run(
        `SELECT ${peoplePage(false, true)}#>>'{rows,0,email}' IS NULL; SELECT ${peoplePage(true, true)}#>>'{rows,0,email}' IS NOT NULL;`,
      ),
    ).toEqual(["t", "t"]);
  });
  it("Viewer cannot call the legacy raw sign-in page", () => {
    expect(
      run(
        roleSetup("viewer") +
          refuse("PERFORM pg_temp.admin_sign_in_page('2026-10-01','2026-10-31','all','all','all')"),
      ),
    ).toEqual(["refused"]);
  });
  it("Operations cannot assign Reports access", () => {
    expect(
      run(
        roleSetup("operations") +
          refuse(
            "PERFORM pg_temp.reports_set_access('00000000-0000-4000-8000-000000000006','owner')",
          ),
      ),
    ).toEqual(["refused"]);
  });
  it("last Owner cannot be downgraded through Reports access", () => {
    expect(
      run(
        `DO $$ BEGIN PERFORM pg_temp.reports_set_access('00000000-0000-4000-8000-000000000006','viewer'); RAISE EXCEPTION 'last Owner removed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'REPORT_LAST_OWNER:%' THEN RAISE; END IF; END $$; SELECT role FROM reports_access;`,
      ),
    ).toEqual(["owner"]);
  });
  it("a replacement Owner permits downgrade and audits both changes", () => {
    expect(
      run(
        `INSERT INTO pg_temp.user_roles(user_id,role) VALUES('00000000-0000-4000-8000-000000000020','admin'); INSERT INTO reports_access(user_id,role) VALUES('00000000-0000-4000-8000-000000000020','owner'); SELECT pg_temp.reports_set_access('00000000-0000-4000-8000-000000000006','viewer'); SELECT count(*) FROM admin_audit_log; SELECT role FROM reports_access WHERE user_id='00000000-0000-4000-8000-000000000006';`,
      ).slice(-2),
    ).toEqual(["2", "viewer"]);
  });
  it("no Reports policies or RPC gates remain on operational Admin data", () => {
    expect(
      run(
        `SELECT count(*) FROM pg_policies WHERE policyname IN ('Reports direct Admin read guard','Reports role read guard','Reports profile read guard','Reports private Admin storage guard'); SELECT count(*) FROM pg_trigger WHERE tgname='reports_admin_lifecycle_guard' AND NOT tgisinternal; SELECT count(*) FROM pg_proc WHERE proname IN ('mint_billing_doc_number','restore_deleted_document','list_recently_deleted_documents') AND pronamespace='public'::regnamespace AND prosrc LIKE '%reports_can%';`,
      ),
    ).toEqual(["0", "0", "0"]);
  });
});
