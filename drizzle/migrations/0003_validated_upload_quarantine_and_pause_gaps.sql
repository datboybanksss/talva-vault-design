ALTER TABLE public.talent_private_documents ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE public.talent_private_documents ADD COLUMN IF NOT EXISTS validation_pending_since timestamptz;
ALTER TABLE public.talent_shared_documents ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE public.talent_shared_documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.talent_shared_documents ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.talent_shared_document_versions ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE public.talent_invitation_documents ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE public.agency_compliance_documents ADD COLUMN IF NOT EXISTS validated_at timestamptz;
CREATE OR REPLACE FUNCTION public.protect_upload_validation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.role() = 'authenticated' THEN
  IF TG_OP = 'INSERT' AND NEW.validated_at IS NOT NULL THEN RAISE EXCEPTION 'Only the file checker can validate an upload.'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.validated_at IS DISTINCT FROM OLD.validated_at OR (OLD.validated_at IS NOT NULL AND (NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes))) THEN RAISE EXCEPTION 'Validated file details cannot be changed. Upload a new version instead.'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['talent_private_documents','talent_shared_documents','talent_shared_document_versions','talent_invitation_documents','agency_compliance_documents'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS protect_upload_validation ON public.%I',t);
  EXECUTE format('CREATE TRIGGER protect_upload_validation BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_upload_validation()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.validated_storage_object(_bucket text, _path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE _bucket
 WHEN 'talent-private-documents' THEN EXISTS(SELECT 1 FROM public.talent_private_documents d WHERE d.storage_path=_path AND d.validated_at IS NOT NULL AND d.user_id::text=split_part(_path,'/',1))
 WHEN 'talent-documents' THEN EXISTS(SELECT 1 FROM public.talent_shared_documents d WHERE d.storage_path=_path AND d.validated_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.talent_shared_document_versions v WHERE v.storage_path=_path AND v.validated_at IS NOT NULL)
 WHEN 'talent-invite-docs' THEN EXISTS(SELECT 1 FROM public.talent_invitation_documents d WHERE d.storage_path=_path AND d.validated_at IS NOT NULL)
 WHEN 'agency-compliance-docs' THEN EXISTS(SELECT 1 FROM public.agency_compliance_documents d WHERE d.storage_path=_path AND d.validated_at IS NOT NULL)
 ELSE true END;
$$;
REVOKE ALL ON FUNCTION public.validated_storage_object(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validated_storage_object(text,text) TO authenticated, service_role;
DROP POLICY IF EXISTS "Validated file required" ON storage.objects;
CREATE POLICY "Validated file required" ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (public.validated_storage_object(bucket_id,name));
DROP POLICY IF EXISTS "Validated file immutable" ON storage.objects;
CREATE POLICY "Validated file immutable" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (bucket_id NOT IN ('talent-private-documents','talent-documents','talent-invite-docs','agency-compliance-docs') OR NOT public.validated_storage_object(bucket_id,name)) WITH CHECK (bucket_id NOT IN ('talent-private-documents','talent-documents','talent-invite-docs','agency-compliance-docs') OR NOT public.validated_storage_object(bucket_id,name));
CREATE OR REPLACE FUNCTION public.private_document_folder_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF NEW.folder_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.folder_id IS DISTINCT FROM OLD.folder_id) AND NOT EXISTS (SELECT 1 FROM public.talent_private_folders f WHERE f.id=NEW.folder_id AND f.user_id=NEW.user_id AND f.removed_at IS NULL) THEN RAISE EXCEPTION 'That folder is no longer available in your private vault.'; END IF;
 IF split_part(NEW.storage_path,'/',1) IS DISTINCT FROM NEW.user_id::text THEN RAISE EXCEPTION 'That file is not in your private vault.'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS private_document_folder_guard ON public.talent_private_documents;
CREATE TRIGGER private_document_folder_guard BEFORE INSERT OR UPDATE ON public.talent_private_documents FOR EACH ROW EXECUTE FUNCTION public.private_document_folder_guard();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['agency_talent_folders_backup_20261023','document_bulk_delete_flags','document_storage_purge_queue','folder_catalogue_subfolders_backup_20261023','shared_folder_merge_doc_map','shared_folder_merge_map','tsd_folder_backup_20261023'] LOOP
  EXECUTE format('CREATE POLICY "Paused account blocked" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.account_read_allowed(auth.uid()))) WITH CHECK ((SELECT public.account_read_allowed(auth.uid())))',t);
 END LOOP;
END $$;
ALTER TABLE public.loved_one_shares ADD CONSTRAINT active_share_requires_code CHECK (is_active IS NOT TRUE OR access_code_hash IS NOT NULL) NOT VALID;
CREATE OR REPLACE FUNCTION public.share_owner_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.talent_profiles p WHERE p.id=NEW.talent_id AND p.user_id=NEW.created_by) THEN RAISE EXCEPTION 'This share does not belong to your account.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.talent_id IS DISTINCT FROM OLD.talent_id OR NEW.token IS DISTINCT FROM OLD.token) THEN RAISE EXCEPTION 'Share ownership cannot be changed.'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS share_owner_guard ON public.loved_one_shares;
CREATE TRIGGER share_owner_guard BEFORE INSERT OR UPDATE ON public.loved_one_shares FOR EACH ROW EXECUTE FUNCTION public.share_owner_guard();