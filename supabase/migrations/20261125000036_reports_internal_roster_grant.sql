-- Canonical guarded history copy of applied 0036_reports_internal_roster_grant.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF NOT has_function_privilege('service_role','public.reports_people_rows(date,date,jsonb,timestamptz)','EXECUTE') THEN
GRANT EXECUTE ON FUNCTION public.reports_people_rows(date,date,jsonb,timestamptz) TO service_role;
 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
