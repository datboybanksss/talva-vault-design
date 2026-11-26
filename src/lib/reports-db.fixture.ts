export const reportsDbFixture = `
CREATE TEMP TABLE profiles(id uuid,display_name text,first_name text,last_name text,email text,terms_accepted_at timestamptz);
CREATE TEMP TABLE agencies(id uuid,name text,is_test boolean);
CREATE TEMP TABLE agency_members(user_id uuid,agency_id uuid,created_at timestamptz);
CREATE TEMP TABLE agency_invitations(agency_id uuid,email text,accepted_at timestamptz);
CREATE TEMP TABLE user_roles(user_id uuid,role text);
CREATE TEMP TABLE talent_profiles(id uuid,user_id uuid,full_name text,activation_completed_at timestamptz,created_at timestamptz,deleted_at timestamptz,is_test boolean,paused_at timestamptz,suspended_at timestamptz);
CREATE TEMP TABLE agency_talent_links(talent_user_id uuid,agency_id uuid,status text,ended_at timestamptz,created_at timestamptz);
CREATE TEMP TABLE loved_one_shares(id uuid,talent_id uuid,loved_one_email text,loved_one_name text,created_at timestamptz,access_code_hash text);
CREATE TEMP TABLE talent_audit_log(id uuid DEFAULT gen_random_uuid(),actor_id uuid,actor_email text,action text,target_type text,target_id uuid,target_label text,detail jsonb,ip_address text,user_agent text,sign_in_session_id uuid,created_at timestamptz DEFAULT now());
CREATE TEMP TABLE loved_one_share_access_events(share_id uuid,event text,created_at timestamptz);
ALTER TABLE talent_profiles ADD email text;
ALTER TABLE agencies ADD paused_at timestamptz, ADD status text DEFAULT 'accepted';
ALTER TABLE profiles ADD created_at timestamptz DEFAULT '2026-08-01';
ALTER TABLE agency_members ADD suspended boolean DEFAULT false;
ALTER TABLE agency_invitations ADD id uuid DEFAULT gen_random_uuid(), ADD contact_person text, ADD first_sent_at timestamptz, ADD source text, ADD created_at timestamptz DEFAULT '2026-08-01';
CREATE TEMP TABLE independent_talent_invitations(id uuid DEFAULT gen_random_uuid(),email text,talent_name text,accepted_at timestamptz,first_sent_at timestamptz,source text,created_at timestamptz DEFAULT '2026-08-01');
CREATE TEMP TABLE talent_invitations(id uuid,email text,talent_name text,agency_id uuid,accepted_at timestamptz,first_sent_at timestamptz,created_at timestamptz);
CREATE TEMP TABLE talent_invite_private(invitation_id uuid,kind text);
CREATE TEMP TABLE reports_talent_milestones(user_id uuid,first_validated_upload_at timestamptz);
CREATE TEMP TABLE talent_private_documents(user_id uuid,validated_at timestamptz,quarantine_reason text,created_at timestamptz);
CREATE TEMP TABLE talent_shared_documents(uploaded_by uuid,talent_link_id uuid,validated_at timestamptz,quarantine_reason text,copied_from_vault_at timestamptz,created_at timestamptz);
ALTER TABLE agency_talent_links ADD id uuid DEFAULT gen_random_uuid();
ALTER TABLE agency_invitations ADD email_sent_at timestamptz, ADD last_sent_at timestamptz;
ALTER TABLE independent_talent_invitations ADD email_sent_at timestamptz, ADD last_sent_at timestamptz;
ALTER TABLE talent_invitations ADD email_sent_at timestamptz, ADD last_sent_at timestamptz;
CREATE FUNCTION pg_temp.reports_can(text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('metering.admin',true),'yes') <> 'no' $$;
CREATE FUNCTION pg_temp.invitation_counts_as_test(text,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce((SELECT is_test FROM pg_temp.agencies WHERE id=$2),false) $$;
CREATE FUNCTION pg_temp.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
CREATE FUNCTION pg_temp.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (pg_temp.jwt()->>'sub')::uuid $$;
CREATE FUNCTION pg_temp.mfa_ok() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('metering.mfa',true),'off') <> 'blocked' $$;
CREATE FUNCTION pg_temp.account_ok(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION pg_temp.is_admin(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('metering.admin',true),'yes') <> 'no' $$;
DO $$ DECLARE n text; d text; t text; BEGIN
  FOREACH n IN ARRAY ARRAY['reports_login_range_complete(date,date)','reports_login_history()','sign_in_capture_started_at()','reports_people_rows(date,date,jsonb,timestamptz)','reports_sign_in_summary(date,date,jsonb,date,date,timestamptz)','admin_sign_in_people(date,date,text,timestamptz)','admin_sign_in_summary(date,date,text,timestamptz)','admin_sign_in_page(date,date,text,text,text,uuid,text,text,integer,integer,timestamptz)','record_completed_sign_in(text,text,text,boolean)'] LOOP
    d:=pg_get_functiondef(('public.'||n)::regprocedure);
    d:=replace(d,'auth.jwt()','pg_temp.jwt()');
    d:=replace(d,'auth.uid()','pg_temp.uid()');
    d:=replace(d,'public.mfa_session_ok()','pg_temp.mfa_ok()');
    d:=replace(d,'public.account_read_allowed','pg_temp.account_ok');
    d:=replace(d,'public.has_role','pg_temp.is_admin');
    d:=replace(d,'public.reports_can','pg_temp.reports_can');
    d:=replace(d,'public.invitation_counts_as_test','pg_temp.invitation_counts_as_test');
    FOREACH t IN ARRAY ARRAY['reports_people_rows','reports_sign_in_summary','reports_talent_milestones','independent_talent_invitations','talent_invitations','talent_invite_private','talent_private_documents','talent_shared_documents'] LOOP d:=replace(d,'public.'||t,'pg_temp.'||t); END LOOP;
    FOREACH t IN ARRAY ARRAY['reports_login_range_complete','reports_login_history','sign_in_capture_started_at','admin_sign_in_people','admin_sign_in_summary','admin_sign_in_page','record_completed_sign_in','profiles','agencies','agency_members','agency_invitations','user_roles','talent_profiles','agency_talent_links','loved_one_shares','talent_audit_log','loved_one_share_access_events'] LOOP
      d:=replace(d,'public.'||t,'pg_temp.'||t);
    END LOOP;
    IF n='sign_in_capture_started_at()' THEN d:= 'CREATE FUNCTION pg_temp.sign_in_capture_started_at() RETURNS timestamptz LANGUAGE sql AS ''SELECT ''''2026-08-01''''::timestamptz'''; END IF;
    EXECUTE d;
  END LOOP;
  SELECT pg_get_indexdef(indexrelid) INTO d FROM pg_index WHERE indexrelid='public.talent_login_session_unique'::regclass;
  EXECUTE replace(d,'ON public.talent_audit_log','ON pg_temp.talent_audit_log');
END $$;
DO $$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"11111111-1111-4111-8111-111111111111"}',true); END $$;
INSERT INTO agencies(id,name,is_test) VALUES ('10000000-0000-4000-8000-000000000001','Agency A',false),('10000000-0000-4000-8000-000000000002','Agency B',false),('10000000-0000-4000-8000-000000000003','Test agency',true);
INSERT INTO profiles(id,display_name,first_name,last_name,email,terms_accepted_at) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Person '||n,NULL,NULL,'person'||n||'@example.com','2026-08-01' FROM generate_series(1,12) n;
INSERT INTO agency_members(user_id,agency_id,created_at) VALUES ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-08-01'),('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-08-01'),('00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','2026-08-01'),('00000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000003','2026-08-01');
INSERT INTO user_roles VALUES('00000000-0000-4000-8000-000000000006','admin');
INSERT INTO talent_profiles(id,user_id,full_name,activation_completed_at,created_at,deleted_at,is_test,paused_at,suspended_at) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Talent '||n,CASE WHEN n>=8 THEN NULL ELSE CASE WHEN n=5 THEN '2026-10-02'::timestamptz ELSE '2026-08-01'::timestamptz END END,'2026-08-01',CASE WHEN n=10 THEN '2026-09-01'::timestamptz ELSE NULL END,n=3 OR n=9,CASE WHEN n=3 THEN '2026-09-01'::timestamptz ELSE NULL END,CASE WHEN n=4 THEN '2026-09-01'::timestamptz ELSE NULL END FROM generate_series(1,12) n;
INSERT INTO agency_talent_links(talent_user_id,agency_id,status,ended_at,created_at) VALUES('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','active',NULL,'2026-08-01');
UPDATE talent_profiles t SET email=p.email FROM profiles p WHERE p.id=t.user_id;
INSERT INTO agency_invitations(agency_id,email,accepted_at) SELECT m.agency_id,p.email,'2026-08-01' FROM agency_members m JOIN profiles p ON p.id=m.user_id;
INSERT INTO independent_talent_invitations(email,talent_name,accepted_at,source) SELECT p.email,t.full_name,t.activation_completed_at,'admin' FROM talent_profiles t JOIN profiles p ON p.id=t.user_id WHERE t.activation_completed_at IS NOT NULL;
INSERT INTO talent_audit_log(actor_id,action,created_at) VALUES
('00000000-0000-4000-8000-000000000001','login','2026-10-01 21:59Z'),('00000000-0000-4000-8000-000000000001','login','2026-10-01 22:01Z'),('00000000-0000-4000-8000-000000000001','login','2026-10-02 03:00Z'),
('00000000-0000-4000-8000-000000000002','login','2026-10-05 10:00Z'),('00000000-0000-4000-8000-000000000002','login','2026-10-05 11:00Z'),('00000000-0000-4000-8000-000000000006','login','2026-10-05 11:00Z'),('00000000-0000-4000-8000-000000000003','login','2026-11-01 01:00Z');
INSERT INTO loved_one_shares VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',' Mixed@Example.com ','Recipient','2026-08-01','hash'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','mixed@example.com','Recipient','2026-08-01','hash');
INSERT INTO loved_one_share_access_events VALUES('30000000-0000-4000-8000-000000000001','successful_code','2026-10-01 22:01Z'),('30000000-0000-4000-8000-000000000002','successful_code','2026-10-01 21:59Z'),('30000000-0000-4000-8000-000000000001','opened','2026-10-03 11:00Z'),('30000000-0000-4000-8000-000000000001','download','2026-10-04 11:00Z');
`;
