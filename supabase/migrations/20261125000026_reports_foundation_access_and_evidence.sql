-- Canonical guarded history copy of applied 0026_reports_foundation_access_and_evidence.sql.
-- Already-present changes are deliberately not re-applied.
DO $reports_history$ BEGIN
 IF to_regclass('public.reports_access') IS NULL THEN
CREATE TABLE IF NOT EXISTS public.reports_access (user_id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','operations','analyst','viewer')), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.reports_access TO authenticated;
GRANT ALL ON public.reports_access TO service_role;
ALTER TABLE public.reports_access ENABLE ROW LEVEL SECURITY;
INSERT INTO public.reports_access(user_id,role) SELECT user_id,CASE WHEN is_main_admin THEN 'owner' ELSE 'viewer' END FROM public.user_roles WHERE role='admin' ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.reports_can(_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin') AND public.account_read_allowed(auth.uid()) AND public.mfa_session_ok() AND EXISTS(SELECT 1 FROM public.reports_access a WHERE a.user_id=auth.uid() AND CASE _permission WHEN 'view_reports' THEN true WHEN 'download_raw_data' THEN a.role IN ('owner','operations','analyst') WHEN 'include_email_addresses' THEN a.role='owner' WHEN 'send_messages' THEN a.role IN ('owner','operations') WHEN 'approve_large_sends' THEN a.role IN ('owner','operations') WHEN 'manage_access' THEN a.role='owner' ELSE false END) $$;
REVOKE ALL ON FUNCTION public.reports_can(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reports_can(text) TO authenticated,service_role;
CREATE POLICY "Own Reports role or Owner" ON public.reports_access FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.reports_can('manage_access'));
CREATE OR REPLACE FUNCTION public.reports_access_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_role text; target uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(77112501);
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF TG_OP<>'INSERT' THEN old_role:=OLD.role; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.reports_can('manage_access') THEN RAISE EXCEPTION 'REPORT_ACCESS_DENIED: Only a Reports Owner can change access.' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'REPORT_ACCESS_DENIED: The administrator cannot be changed.' USING ERRCODE='42501'; END IF;
  IF old_role='owner' AND (TG_OP='DELETE' OR NEW.role<>'owner') AND NOT EXISTS(SELECT 1 FROM public.reports_access a JOIN public.user_roles r ON r.user_id=a.user_id AND r.role='admin' AND NOT r.suspended WHERE a.role='owner' AND a.user_id<>target) THEN RAISE EXCEPTION 'REPORT_LAST_OWNER: Keep at least one active Reports Owner.'; END IF;
  IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=target AND r.role='admin' AND NOT r.suspended) THEN RAISE EXCEPTION 'REPORT_ACCESS_DENIED: Choose an active administrator.'; END IF;
  INSERT INTO public.admin_audit_log(actor_id,action,target_type,target_id,detail) VALUES(auth.uid(),'reports_access_changed','administrator',target::text,jsonb_build_object('from',old_role,'to',CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.role END));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER reports_access_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reports_access FOR EACH ROW EXECUTE FUNCTION public.reports_access_guard();
INSERT INTO public.admin_audit_log(action,target_type,target_id,detail) SELECT 'reports_access_bootstrapped','administrator',user_id::text,jsonb_build_object('role',role,'reason','Approved Reports Phase 1') FROM public.reports_access a WHERE NOT EXISTS(SELECT 1 FROM public.admin_audit_log l WHERE l.action='reports_access_bootstrapped' AND l.target_id=a.user_id::text);
CREATE OR REPLACE FUNCTION public.reports_admin_lifecycle_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(77112501);
  IF TG_OP<>'INSERT' AND OLD.role='admin' AND EXISTS(SELECT 1 FROM public.reports_access WHERE user_id=OLD.user_id AND role='owner') AND (TG_OP='DELETE' OR NEW.suspended OR NEW.role<>'admin') AND NOT EXISTS(SELECT 1 FROM public.reports_access a JOIN public.user_roles r ON r.user_id=a.user_id AND r.role='admin' AND NOT r.suspended WHERE a.role='owner' AND a.user_id<>OLD.user_id) THEN RAISE EXCEPTION 'REPORT_LAST_OWNER: Keep at least one active Reports Owner.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reports_admin_lifecycle_guard BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.reports_admin_lifecycle_guard();
CREATE OR REPLACE FUNCTION public.reports_admin_default_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF NEW.role='admin' THEN INSERT INTO public.reports_access(user_id,role) VALUES(NEW.user_id,'viewer') ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
CREATE TRIGGER reports_admin_default_role AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.reports_admin_default_role();
CREATE OR REPLACE FUNCTION public.reports_set_access(_user_id uuid,_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF NOT public.reports_can('manage_access') THEN RAISE EXCEPTION 'REPORT_ACCESS_DENIED: Only a Reports Owner can change access.' USING ERRCODE='42501'; END IF; UPDATE public.reports_access SET role=_role WHERE user_id=_user_id; IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ACCESS_DENIED: That administrator could not be found.'; END IF; END $$;
REVOKE ALL ON FUNCTION public.reports_set_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reports_set_access(uuid,text) TO authenticated;
CREATE TABLE IF NOT EXISTS public.reports_saved_views(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80), filters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reports_saved_views TO authenticated;
GRANT ALL ON public.reports_saved_views TO service_role;
ALTER TABLE public.reports_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Private Reports views" ON public.reports_saved_views FOR ALL TO authenticated USING(user_id=auth.uid() AND public.reports_can('view_reports')) WITH CHECK(user_id=auth.uid() AND public.reports_can('view_reports'));
CREATE TABLE IF NOT EXISTS public.reports_talent_milestones(user_id uuid PRIMARY KEY, first_validated_upload_at timestamptz NOT NULL, evidence_kind text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.reports_talent_milestones TO service_role;
ALTER TABLE public.reports_talent_milestones ENABLE ROW LEVEL SECURITY;
INSERT INTO public.reports_talent_milestones(user_id,first_validated_upload_at,evidence_kind) SELECT user_id,min(validated_at),'validated_existing_upload' FROM (
 SELECT d.user_id,d.validated_at FROM public.talent_private_documents d WHERE d.validated_at IS NOT NULL AND d.quarantine_reason IS NULL
 UNION ALL SELECT d.uploaded_by,d.validated_at FROM public.talent_shared_documents d JOIN public.agency_talent_links l ON l.id=d.talent_link_id WHERE d.uploaded_by=l.talent_user_id AND d.validated_at IS NOT NULL AND d.quarantine_reason IS NULL AND d.copied_from_vault_at IS NULL
 UNION ALL SELECT v.uploaded_by,v.validated_at FROM public.talent_shared_document_versions v JOIN public.talent_shared_documents d ON d.id=v.document_id JOIN public.agency_talent_links l ON l.id=d.talent_link_id WHERE v.uploaded_by=l.talent_user_id AND v.validated_at IS NOT NULL AND v.quarantine_reason IS NULL AND d.copied_from_vault_at IS NULL
) e JOIN public.talent_profiles t USING(user_id) GROUP BY user_id ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.reports_capture_talent_upload() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE u uuid; BEGIN
 IF NEW.validated_at IS NULL OR NEW.quarantine_reason IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='talent_private_documents' THEN u:=NEW.user_id;
 ELSIF TG_TABLE_NAME='talent_shared_documents' THEN SELECT l.talent_user_id INTO u FROM public.agency_talent_links l WHERE l.id=NEW.talent_link_id AND l.talent_user_id=NEW.uploaded_by AND NEW.copied_from_vault_at IS NULL;
 ELSE SELECT l.talent_user_id INTO u FROM public.talent_shared_documents d JOIN public.agency_talent_links l ON l.id=d.talent_link_id WHERE d.id=NEW.document_id AND l.talent_user_id=NEW.uploaded_by AND d.copied_from_vault_at IS NULL; END IF;
 IF u IS NOT NULL AND EXISTS(SELECT 1 FROM public.talent_profiles WHERE user_id=u) THEN INSERT INTO public.reports_talent_milestones(user_id,first_validated_upload_at,evidence_kind) VALUES(u,NEW.validated_at,'validated_own_upload') ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reports_capture_private_upload AFTER INSERT OR UPDATE OF validated_at ON public.talent_private_documents FOR EACH ROW EXECUTE FUNCTION public.reports_capture_talent_upload();
CREATE TRIGGER reports_capture_shared_upload AFTER INSERT OR UPDATE OF validated_at ON public.talent_shared_documents FOR EACH ROW EXECUTE FUNCTION public.reports_capture_talent_upload();
CREATE TRIGGER reports_capture_version_upload AFTER INSERT OR UPDATE OF validated_at ON public.talent_shared_document_versions FOR EACH ROW EXECUTE FUNCTION public.reports_capture_talent_upload();
CREATE TABLE IF NOT EXISTS public.reports_export_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL, dataset text NOT NULL, filters jsonb NOT NULL, email_included boolean NOT NULL DEFAULT false, row_count integer NOT NULL CHECK(row_count>=0), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.reports_export_history TO authenticated;
GRANT ALL ON public.reports_export_history TO service_role;
ALTER TABLE public.reports_export_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports export history" ON public.reports_export_history FOR SELECT TO authenticated USING(admin_id=auth.uid() OR public.reports_can('manage_access'));
CREATE POLICY "Reports export receipts" ON public.reports_export_history FOR INSERT TO authenticated WITH CHECK(admin_id=auth.uid() AND public.reports_can('download_raw_data') AND (NOT email_included OR public.reports_can('include_email_addresses')));
DO $$ DECLARE r record; expression text; BEGIN
 FOR r IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public' AND cmd IN ('SELECT','ALL') AND qual LIKE '%admin%' AND tablename NOT IN ('reports_access','reports_saved_views','reports_export_history','user_roles','profiles','platform_settings','admin_notification_dismissals') LOOP
   EXECUTE format('CREATE POLICY "Reports direct Admin read guard" ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(),''admin'') OR (public.reports_can(''download_raw_data'') AND public.reports_can(''include_email_addresses'')))',r.tablename);
 END LOOP;
END $$;
CREATE POLICY "Reports profile read guard" ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated USING(id=auth.uid() OR NOT public.has_role(auth.uid(),'admin') OR (public.reports_can('download_raw_data') AND public.reports_can('include_email_addresses')));
CREATE POLICY "Reports role read guard" ON public.user_roles AS RESTRICTIVE FOR SELECT TO authenticated USING(user_id=auth.uid() OR NOT public.has_role(auth.uid(),'admin') OR (public.reports_can('download_raw_data') AND public.reports_can('include_email_addresses')));
CREATE INDEX IF NOT EXISTS reports_views_user_idx ON public.reports_saved_views(user_id,created_at);
CREATE INDEX IF NOT EXISTS reports_exports_admin_idx ON public.reports_export_history(admin_id,created_at);
-- Rollback: remove the named Reports guard policies and Reports triggers; revert reporting code. Retain Reports tables/milestones/audit/export evidence. No account/document/test data or MFA setting was modified.

 END IF;
END $reports_history$;
/* Rollback: revoke the Reports endpoints listed in docs/reports-phase1.md and revert Reports UI only.
Keep Reports access/milestones/saved views/export receipts/audit evidence. Never restore the obsolete broad Admin guards.
No account, document, invitation, Test flag or two-step data is rolled back or erased. */
