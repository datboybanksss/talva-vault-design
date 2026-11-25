-- Canonical guarded history copy of applied 0030_reports_private_storage_and_legacy_rpc_guards.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_description WHERE objoid='public.reports_access'::regclass AND description LIKE 'Reports-only roles:%') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='Reports private Admin storage guard') THEN
CREATE POLICY "Reports private Admin storage guard" ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.has_role(auth.uid(),'admin') OR (public.reports_can('download_raw_data') AND public.reports_can('include_email_addresses')) OR EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id=bucket_id AND b.public));
DO $$ DECLARE f text; d text; BEGIN FOREACH f IN ARRAY ARRAY['public.list_recently_deleted_documents(uuid)','public.restore_deleted_document(uuid)','public.mint_billing_doc_number(uuid,text)'] LOOP d:=pg_get_functiondef(f::regprocedure); d:=replace(d,'BEGIN','BEGIN IF public.has_role(auth.uid(),''admin'') AND NOT public.reports_can(''include_email_addresses'') THEN RAISE EXCEPTION ''REPORT_ACCESS_DENIED: Your Reports role does not allow operational records.'' USING ERRCODE=''42501''; END IF;'); EXECUTE d; END LOOP; END $$;
-- Rollback: remove only the named Reports storage policy and restore these RPCs from their preceding migrations. Existing MFA/private-storage rules remain unchanged.

 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
