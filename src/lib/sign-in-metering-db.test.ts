import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Execute installed SQL on isolated temp fixtures; never create accounts, mint sessions or change the live switch.
import { reportsDbFixture as fixture } from "./reports-db.fixture";

function run(sql: string) {
  const result = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: `BEGIN;${fixture}${sql}ROLLBACK;`,
    encoding: "utf8",
    timeout: 20000,
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n");
}
const people = "pg_temp.admin_sign_in_people('2026-10-01','2026-10-31','all','2026-11-02')";
describe.skipIf(!process.env["PGHOST"])("installed sign-in SQL on isolated data", () => {
  it("counts SAST days, same-day completions and multi-agency staff once", () => {
    expect(
      run(
        `SELECT sign_ins||','||active_days||','||cardinality(agency_ids)||','||average_per_week FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000001';`,
      ),
    ).toEqual(["3,2,2,0.68"]);
  });
  it("same-day talent logins are two sign-ins, one active day", () =>
    expect(
      run(
        `SELECT sign_ins||','||active_days FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000002';`,
      ),
    ).toEqual(["2,1"]));
  it("excludes Admin, gives staff priority and retains zero-sign-in independent talent", () => {
    expect(
      run(
        `SELECT count(*) FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000006'; SELECT account_type FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000001'; SELECT sign_ins||','||cardinality(agency_ids) FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000004';`,
      ),
    ).toEqual(["0", "agency_staff", "0,0"]);
  });
  it("includes paused/suspended and legacy registered people, excludes deleted", () =>
    expect(
      run(
        `SELECT count(*) FROM ${people} WHERE person_id IN ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'); SELECT count(*) FROM ${people} WHERE person_id IN ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010');`,
      ),
    ).toEqual(["2", "2"]));
  it("measures never-signed-in dormancy at period end with exact 30-day boundary", () =>
    expect(
      run(
        `SELECT dormant FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000005'; SELECT dormant FROM pg_temp.admin_sign_in_people('2026-10-01','2026-11-01','all','2026-11-02') WHERE person_id='00000000-0000-4000-8000-000000000005';`,
      ),
    ).toEqual(["f", "t"]));
  it("excludes future events beyond the period cutoff", () =>
    expect(
      run(`SELECT sign_ins FROM ${people} WHERE person_id='00000000-0000-4000-8000-000000000003';`),
    ).toEqual(["0"]));
  it("scopes contact events before dedup and ignores opened/download", () => {
    expect(
      run(
        `SELECT sign_ins||','||active_days FROM ${people} WHERE account_type='trusted_contact'; SELECT sign_ins||','||active_days FROM pg_temp.admin_sign_in_people('2026-10-01','2026-10-31','real','2026-11-02') WHERE account_type='trusted_contact'; SELECT sign_ins||','||active_days FROM pg_temp.admin_sign_in_people('2026-10-01','2026-10-31','test','2026-11-02') WHERE account_type='trusted_contact';`,
      ),
    ).toEqual(["2,2", "1,1", "1,1"]);
  });
  it("staff inherit agency test flags, talent inherit their own", () =>
    expect(
      run(
        `SELECT account_type||':'||count(*) FROM pg_temp.admin_sign_in_people('2026-10-01','2026-10-31','test','2026-11-02') GROUP BY account_type ORDER BY account_type;`,
      ),
    ).toEqual(["agency_staff:1", "talent:2", "trusted_contact:1"]));
  it("pages matching profiles on the server and summaries reconcile", () => {
    expect(
      run(
        `SELECT pg_temp.admin_sign_in_page('2026-10-01','2026-10-31','all','agency_staff','active',NULL,'sign_ins','desc',1,0,'2026-11-02')->>'total'; SELECT pg_temp.admin_sign_in_page('2026-10-01','2026-10-31','all','agency_staff','active',NULL,'sign_ins','desc',1,0,'2026-11-02')#>>'{rows,0,sign_ins}'; SELECT value#>>'{current,sign_ins}' FROM jsonb_array_elements(pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','all','2026-11-02')->'groups') WHERE value->>'type'='agency_staff';`,
      ),
    ).toEqual(["1", "3", "3"]);
  });
  it("equal-length prior periods and invalid ranges", () => {
    expect(
      run(
        `SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','all','2026-11-02')->>'prior';`,
      ),
    ).toEqual(['{"to": "2026-09-30", "from": "2026-08-31"}']);
    expect(
      run(
        `DO $$ BEGIN PERFORM * FROM pg_temp.admin_sign_in_people('2026-10-31','2026-10-01','real'); RAISE EXCEPTION 'invalid range accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'REPORT_RANGE_INVALID:%' THEN RAISE; END IF; END $$; SELECT 'range refused';`,
      ),
    ).toEqual(["range refused"]);
  });
  it("retrying one session writes once; a different completed session counts", () =>
    expect(
      run(
        `SELECT pg_temp.record_completed_sign_in(); SELECT pg_temp.record_completed_sign_in(); DO $$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"22222222-2222-4222-8222-222222222222"}',true); END $$; SELECT pg_temp.record_completed_sign_in(); SELECT count(*) FROM talent_audit_log WHERE sign_in_session_id IS NOT NULL;`,
      ),
    ).toEqual(["t", "f", "t", "2"]));
  it("missing session, failed MFA and non-Admin report calls are refused", () => {
    expect(
      run(
        `DO $$ BEGIN PERFORM set_config('metering.mfa','blocked',true); END $$; DO $$ BEGIN PERFORM pg_temp.record_completed_sign_in(); RAISE EXCEPTION 'incomplete login accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$; DO $$ BEGIN PERFORM set_config('metering.mfa','off',true); END $$; DO $$ BEGIN PERFORM set_config('metering.admin','no',true); END $$; DO $$ BEGIN PERFORM * FROM ${people}; RAISE EXCEPTION 'non-admin allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$; DO $$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true); END $$; DO $$ BEGIN PERFORM pg_temp.record_completed_sign_in(); RAISE EXCEPTION 'missing session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$; SELECT 'all refused';`,
      ),
    ).toEqual(["all refused"]);
  });
  it("includes four legacy people and discloses missing registration dates by scope", () => {
    expect(
      run(
        `SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','all','2026-11-02')->>'missing_registration_dates'; SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','real','2026-11-02')->>'missing_registration_dates'; SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','test','2026-11-02')->>'missing_registration_dates';`,
      ),
    ).toEqual(["4", "3", "1"]);
  });
  it("the installed trigger refuses forged login writes while other audit actions remain allowed", () => {
    expect(
      run(`DO $$ DECLARE d text; BEGIN
      d:=pg_get_functiondef('public.protect_completed_sign_in()'::regprocedure);
      d:=replace(d,'public.protect_completed_sign_in','pg_temp.protect_completed_sign_in');
      d:=replace(d,'public.talent_audit_log','pg_temp.talent_audit_log');
      -- Simulate the unprivileged caller only in the isolated invoker-trigger copy.
      d:=replace(d,'current_user',quote_literal('authenticated'));
      EXECUTE d;
    END $$;
    CREATE TRIGGER protect_completed_sign_in BEFORE INSERT OR UPDATE OR DELETE ON talent_audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.protect_completed_sign_in();
    DO $$ BEGIN
      INSERT INTO talent_audit_log(actor_id,action) VALUES('00000000-0000-4000-8000-000000000002','login');
      RAISE EXCEPTION 'forged login accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
    INSERT INTO talent_audit_log(actor_id,action) VALUES('00000000-0000-4000-8000-000000000002','password_changed');
    SELECT count(*) FROM talent_audit_log WHERE action='password_changed';`),
    ).toEqual(["1"]);
  });
  it("installed grants deny anonymous report and recorder access", () => {
    const result = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
      input:
        "SELECT has_function_privilege('anon','public.admin_sign_in_summary(date,date,text,timestamptz)','EXECUTE'), has_function_privilege('anon','public.record_completed_sign_in(text,text,text,boolean)','EXECUTE');",
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("f|f");
  });
});
