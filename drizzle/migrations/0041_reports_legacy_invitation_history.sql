-- Read historical sends using retained dates; no invitation rows, tokens or expiry are edited.
-- Rollback: restore the reports_history_snapshot function body from 0040 and roster from 0039.
DO $history$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.reports_history_snapshot(date,date,jsonb,timestamptz)'::regprocedure);
 d:=replace(d,'i.created_at,i.first_sent_at,i.accepted_at','i.created_at,CASE WHEN i.status<>''draft'' THEN COALESCE(i.first_sent_at,i.email_sent_at,i.last_sent_at) END first_sent_at,i.accepted_at');
 EXECUTE d;
 d:=pg_get_functiondef('public.reports_people_rows(date,date,jsonb,timestamptz)'::regprocedure);
 IF position('COALESCE(i.first_sent_at,i.email_sent_at,i.last_sent_at) first_sent_at' in d)=0 THEN
 d:=replace(d,'i.accepted_at,i.first_sent_at','i.accepted_at,COALESCE(i.first_sent_at,i.email_sent_at,i.last_sent_at) first_sent_at');
 END IF;
 EXECUTE d;
END $history$;
