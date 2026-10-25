DO $migration$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('account_paused','account_read_allowed','talent_account_writable','talent_read_only_until','talent_link_is_ended','current_retention_rule','document_setting','storage_path_is_document','validated_storage_object','list_recently_deleted_documents','restore_deleted_document','soft_delete_agency_document','stop_sharing_document','sweep_overdue_invoices') LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 IF f.proname='sweep_overdue_invoices' THEN
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated',f.signature);
 ELSE
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END IF;
 END LOOP;
END $migration$;
ALTER VIEW public.admin_loved_one_shares_view SET (security_invoker = on);
CREATE POLICY "Admins read trusted contact share metadata" ON public.loved_one_shares FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
-- Existing restrictive account-access policies continue to apply to admin reads.
-- Rollback (only with security approval): ALTER VIEW public.admin_loved_one_shares_view SET (security_invoker = off); DROP POLICY "Admins read trusted contact share metadata" ON public.loved_one_shares; Restore function grants from the prior migration if intentionally required.