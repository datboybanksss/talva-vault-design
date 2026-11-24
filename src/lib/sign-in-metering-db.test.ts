import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Execute installed SQL on isolated temp fixtures; never create accounts, mint sessions or change the live switch.
const fixture = `
CREATE TEMP TABLE profiles(id uuid,display_name text,first_name text,last_name text,email text,terms_accepted_at timestamptz);
CREATE TEMP TABLE agencies(id uuid,name text,is_test boolean);
CREATE TEMP TABLE agency_members(user_id uuid,agency_id uuid,created_at timestamptz);
CREATE TEMP TABLE agency_invitations(agency_id uuid,email text,accepted_at timestamptz);
CREATE TEMP TABLE user_roles(user_id uuid,role text);
CREATE TEMP TABLE talent_profiles(id uuid,user_id uuid,full_name text,activation_completed_at timestamptz,created_at timestamptz,deleted_at timestamptz,is_test boolean,paused_at timestamptz,suspended_at timestamptz);
CREATE TEMP TABLE agency_talent_links(talent_user_id uuid,agency_id uuid,status text,ended_at timestamptz,created_at timestamptz);
CREATE TEMP TABLE loved_one_shares(id uuid,talent_id uuid,loved_one_email text,loved_one_name text,created_at timestamptz,access_code_hash text);
CREATE TEMP TABLE talent_audit_log(actor_id uuid,actor_email text,action text,target_type text,target_id uuid,target_label text,detail jsonb,ip_address text,user_agent text,sign_in_session_id uuid,created_at timestamptz DEFAULT now());
CREATE TEMP TABLE loved_one_share_access_events(share_id uuid,event text,created_at timestamptz);
CREATE FUNCTION pg_temp.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
CREATE FUNCTION pg_temp.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (pg_temp.jwt()->>'sub')::uuid $$;
CREATE FUNCTION pg_temp.mfa_ok() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('metering.mfa',true),'off') <> 'blocked' $$;
CREATE FUNCTION pg_temp.account_ok(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION pg_temp.is_admin(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('metering.admin',true),'yes') <> 'no' $$;
DO $$ DECLARE n text; d text; t text; BEGIN
  FOREACH n IN ARRAY ARRAY['sign_in_capture_started_at()','admin_sign_in_people(date,date,text,timestamptz)','admin_sign_in_summary(date,date,text,timestamptz)','admin_sign_in_page(date,date,text,text,text,uuid,text,text,integer,integer,timestamptz)','record_completed_sign_in(text,text,text,boolean)'] LOOP
    d:=pg_get_functiondef(('public.'||n)::regprocedure);
    d:=replace(d,'auth.jwt()','pg_temp.jwt()');
    d:=replace(d,'auth.uid()','pg_temp.uid()');
    d:=replace(d,'public.mfa_session_ok()','pg_temp.mfa_ok()');
    d:=replace(d,'public.account_read_allowed','pg_temp.account_ok');
    d:=replace(d,'public.has_role','pg_temp.is_admin');
    FOREACH t IN ARRAY ARRAY['sign_in_capture_started_at','admin_sign_in_people','admin_sign_in_summary','admin_sign_in_page','record_completed_sign_in','profiles','agencies','agency_members','agency_invitations','user_roles','talent_profiles','agency_talent_links','loved_one_shares','talent_audit_log','loved_one_share_access_events'] LOOP
      d:=replace(d,'public.'||t,'pg_temp.'||t);
    END LOOP;
    EXECUTE d;
  END LOOP;
  SELECT pg_get_indexdef(indexrelid) INTO d FROM pg_index WHERE indexrelid='public.talent_login_session_unique'::regclass;
  EXECUTE replace(d,'ON public.talent_audit_log','ON pg_temp.talent_audit_log');
END $$;
DO $$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"11111111-1111-4111-8111-111111111111"}',true); END $$;
INSERT INTO agencies VALUES ('10000000-0000-4000-8000-000000000001','Agency A',false),('10000000-0000-4000-8000-000000000002','Agency B',false),('10000000-0000-4000-8000-000000000003','Test agency',true);
INSERT INTO profiles SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Person '||n,NULL,NULL,'person'||n||'@example.com','2026-08-01' FROM generate_series(1,12) n;
INSERT INTO agency_members VALUES ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-08-01'),('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-08-01'),('00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','2026-08-01'),('00000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000003','2026-08-01');
INSERT INTO user_roles VALUES('00000000-0000-4000-8000-000000000006','admin');
INSERT INTO talent_profiles SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Talent '||n,CASE WHEN n>=8 THEN NULL ELSE CASE WHEN n=5 THEN '2026-10-02'::timestamptz ELSE '2026-08-01'::timestamptz END END,'2026-08-01',CASE WHEN n=10 THEN '2026-09-01'::timestamptz ELSE NULL END,n=3 OR n=9,CASE WHEN n=3 THEN '2026-09-01'::timestamptz ELSE NULL END,CASE WHEN n=4 THEN '2026-09-01'::timestamptz ELSE NULL END FROM generate_series(1,12) n;
INSERT INTO agency_talent_links VALUES('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','active',NULL,'2026-08-01');
INSERT INTO talent_audit_log(actor_id,action,created_at) VALUES
('00000000-0000-4000-8000-000000000001','login','2026-10-01 21:59Z'),('00000000-0000-4000-8000-000000000001','login','2026-10-01 22:01Z'),('00000000-0000-4000-8000-000000000001','login','2026-10-02 03:00Z'),
('00000000-0000-4000-8000-000000000002','login','2026-10-05 10:00Z'),('00000000-0000-4000-8000-000000000002','login','2026-10-05 11:00Z'),('00000000-0000-4000-8000-000000000006','login','2026-10-05 11:00Z'),('00000000-0000-4000-8000-000000000003','login','2026-11-01 01:00Z');
INSERT INTO loved_one_shares VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',' Mixed@Example.com ','Recipient','2026-08-01','hash'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','mixed@example.com','Recipient','2026-08-01','hash');
INSERT INTO loved_one_share_access_events VALUES('30000000-0000-4000-8000-000000000001','successful_code','2026-10-01 22:01Z'),('30000000-0000-4000-8000-000000000002','successful_code','2026-10-01 21:59Z'),('30000000-0000-4000-8000-000000000001','opened','2026-10-03 11:00Z'),('30000000-0000-4000-8000-000000000001','download','2026-10-04 11:00Z');
`;
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
  it("includes paused/suspended and excludes deleted/unconfirmed", () =>
    expect(
      run(
        `SELECT count(*) FROM ${people} WHERE person_id IN ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'); SELECT count(*) FROM ${people} WHERE person_id IN ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010');`,
      ),
    ).toEqual(["2", "0"]));
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
    ).toEqual(["agency_staff:1", "talent:1", "trusted_contact:1"]));
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
  it("keeps all four unconfirmed talent outside totals with scope-specific helper counts", () => {
    expect(
      run(
        `SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','all','2026-11-02')->>'unconfirmed_talent'; SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','real','2026-11-02')->>'unconfirmed_talent'; SELECT pg_temp.admin_sign_in_summary('2026-10-01','2026-10-31','test','2026-11-02')->>'unconfirmed_talent';`,
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
