CREATE OR REPLACE FUNCTION public.replace_blocked_onboarding_file()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
DECLARE old_file record; file_bucket text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR NEW.validated_at IS NULL OR NEW.quarantine_reason IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'onboarding_staged_uploads' THEN
    file_bucket := CASE NEW.kind WHEN 'agency' THEN 'agency-compliance-docs' ELSE 'talent-invite-docs' END;
    FOR old_file IN DELETE FROM public.onboarding_staged_uploads
      WHERE admin_id = NEW.admin_id AND session_id = NEW.session_id AND kind = NEW.kind
        AND doc_slot = NEW.doc_slot AND lower(btrim(file_name)) = lower(btrim(NEW.file_name))
        AND quarantine_reason IS NOT NULL AND storage_path <> NEW.storage_path
      RETURNING storage_path LOOP
      INSERT INTO public.document_storage_purge_queue(bucket, path) VALUES(file_bucket, old_file.storage_path);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'talent_invitation_documents' THEN
    FOR old_file IN DELETE FROM public.talent_invitation_documents
      WHERE invitation_id = NEW.invitation_id AND doc_slot = NEW.doc_slot
        AND lower(btrim(file_name)) = lower(btrim(NEW.file_name)) AND quarantine_reason IS NOT NULL
        AND storage_path <> NEW.storage_path RETURNING storage_path LOOP
      INSERT INTO public.document_storage_purge_queue(bucket,path) VALUES('talent-invite-docs',old_file.storage_path);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'agency_compliance_documents' THEN
    FOR old_file IN DELETE FROM public.agency_compliance_documents
      WHERE invitation_id = NEW.invitation_id AND doc_slot = NEW.doc_slot
        AND lower(btrim(file_name)) = lower(btrim(NEW.file_name)) AND quarantine_reason IS NOT NULL
        AND storage_path <> NEW.storage_path RETURNING storage_path LOOP
      INSERT INTO public.document_storage_purge_queue(bucket,path) VALUES('agency-compliance-docs',old_file.storage_path);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.replace_blocked_onboarding_file() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_blocked_onboarding_file() TO service_role;
CREATE TRIGGER replace_blocked_onboarding_file BEFORE INSERT ON public.onboarding_staged_uploads FOR EACH ROW EXECUTE FUNCTION public.replace_blocked_onboarding_file();
CREATE TRIGGER replace_blocked_onboarding_file BEFORE INSERT ON public.talent_invitation_documents FOR EACH ROW EXECUTE FUNCTION public.replace_blocked_onboarding_file();
CREATE TRIGGER replace_blocked_onboarding_file BEFORE INSERT ON public.agency_compliance_documents FOR EACH ROW EXECUTE FUNCTION public.replace_blocked_onboarding_file();