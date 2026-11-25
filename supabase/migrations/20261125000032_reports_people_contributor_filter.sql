-- Canonical guarded history copy of applied 0032_reports_people_contributor_filter.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.reports_people_rows(date,date,jsonb,timestamptz)') AND prosrc LIKE '%people%person_id IN%') THEN
DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('public.reports_people_rows(date,date,jsonb,timestamptz)'::regprocedure); d:=replace(d,'SELECT to_jsonb(f) FROM filtered f','SELECT to_jsonb(f) FROM filtered f WHERE jsonb_array_length(COALESCE(_filters->''people'',''[]''::jsonb))=0 OR f.person_id IN (SELECT jsonb_array_elements_text(_filters->''people''))'); EXECUTE d; END $$;
-- Rollback: remove the final contributing-people predicate from reports_people_rows. No stored records change.

 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
