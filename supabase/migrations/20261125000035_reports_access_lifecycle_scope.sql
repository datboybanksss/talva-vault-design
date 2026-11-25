-- Canonical guarded history copy of applied 0035_reports_access_lifecycle_scope.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='reports_admin_lifecycle_guard' AND NOT tgisinternal) THEN
DROP TRIGGER IF EXISTS reports_admin_lifecycle_guard ON public.user_roles;
COMMENT ON FUNCTION public.reports_admin_lifecycle_guard() IS 'DEPRECATED: Reports access must not veto operational administrator lifecycle changes; Reports access changes remain last-Owner protected.';
 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
