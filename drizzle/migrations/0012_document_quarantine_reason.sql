DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['talent_private_documents','talent_shared_documents','talent_shared_document_versions','talent_invitation_documents','agency_compliance_documents'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS quarantine_reason text',t);
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',t,t||'_quarantine_reason_check');
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (quarantine_reason IS NULL OR (quarantine_reason IN (''blocked_type'',''failed_check'') AND validated_at IS NULL))',t,t||'_quarantine_reason_check');
  EXECUTE format('COMMENT ON COLUMN public.%I.quarantine_reason IS %L',t,'Set only by the server file checker: blocked_type or failed_check.');
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.protect_upload_validation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.role()='authenticated' THEN
  IF TG_OP='INSERT' AND (NEW.validated_at IS NOT NULL OR NEW.quarantine_reason IS NOT NULL) THEN RAISE EXCEPTION 'Only the file checker can validate an upload.'; END IF;
  IF TG_OP='UPDATE' AND (NEW.validated_at IS DISTINCT FROM OLD.validated_at OR NEW.quarantine_reason IS DISTINCT FROM OLD.quarantine_reason OR (to_jsonb(NEW)->'download_only') IS DISTINCT FROM (to_jsonb(OLD)->'download_only') OR (OLD.validated_at IS NOT NULL AND (NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes))) THEN RAISE EXCEPTION 'Validated file details cannot be changed. Upload a new version instead.'; END IF;
 END IF; RETURN NEW; END $$;