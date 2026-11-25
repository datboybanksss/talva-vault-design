-- Canonical guarded history copy of applied 0033_reports_registered_range_validation.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.admin_sign_in_people(date,date,text,timestamptz)') AND prosrc LIKE '%REPORT_RANGE_INVALID%') THEN
DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('public.admin_sign_in_people(date,date,text,timestamptz)'::regprocedure); d:=replace(d,'RETURN QUERY SELECT','IF _from IS NULL OR _to IS NULL OR _from>_to OR _as_of IS NULL OR _accounts NOT IN (''real'',''test'',''all'') THEN RAISE EXCEPTION ''REPORT_RANGE_INVALID: Please choose a valid reporting period.''; END IF; RETURN QUERY SELECT'); EXECUTE d; END $$;
-- Rollback: restore the preceding admin_sign_in_people definition; no stored data or two-step changes.

 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
