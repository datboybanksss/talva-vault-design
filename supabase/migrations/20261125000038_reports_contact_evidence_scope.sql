-- Canonical guarded history copy of applied 0038_reports_contact_evidence_scope.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.reports_evidence_page(date,date,jsonb,text,integer,integer,timestamptz,boolean)') AND prosrc LIKE '%jsonb_set(jsonb_set(_filters%') THEN
DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('public.reports_evidence_page(date,date,jsonb,text,integer,integer,timestamptz,boolean)'::regprocedure); d:=replace(d,'jsonb_set(jsonb_set(_filters,''{account_type}'',''"talent"''),''{people}'',''[]'')','_filters || jsonb_build_object(''account_type'',''talent'',''people'',''[]''::jsonb,''search'','''',''joined'','''',''stage'',''all'',''activity'',''all'')'); EXECUTE d; END $$;
 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
