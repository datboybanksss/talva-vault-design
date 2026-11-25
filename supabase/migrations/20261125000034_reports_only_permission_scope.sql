-- Canonical guarded history copy of applied 0034_reports_only_permission_scope.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_policies WHERE policyname IN ('Reports direct Admin read guard','Reports profile read guard','Reports role read guard','Reports private Admin storage guard')) OR EXISTS(SELECT 1 FROM pg_proc WHERE proname IN ('mint_billing_doc_number','restore_deleted_document','list_recently_deleted_documents') AND pronamespace='public'::regnamespace AND prosrc LIKE '%reports_can%') THEN
DO $$ DECLARE r record; f text; d text; guard text := ' IF public.has_role(auth.uid(),''admin'') AND NOT public.reports_can(''include_email_addresses'') THEN RAISE EXCEPTION ''REPORT_ACCESS_DENIED: Your Reports role does not allow operational records.'' USING ERRCODE=''42501''; END IF;'; BEGIN
FOR r IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE (schemaname='public' AND policyname IN ('Reports direct Admin read guard','Reports profile read guard','Reports role read guard')) OR (schemaname='storage' AND tablename='objects' AND policyname='Reports private Admin storage guard') LOOP EXECUTE format('DROP POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename); END LOOP;
FOREACH f IN ARRAY ARRAY['public.list_recently_deleted_documents(uuid)','public.restore_deleted_document(uuid)','public.mint_billing_doc_number(uuid,text)'] LOOP d:=pg_get_functiondef(f::regprocedure); d:=replace(d,guard,''); EXECUTE d; END LOOP;
END $$;
COMMENT ON TABLE public.reports_access IS 'Reports-only roles: do not affect existing Admin operational access. Covers Reports, downloads, future messaging and Reports access settings.';
 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
