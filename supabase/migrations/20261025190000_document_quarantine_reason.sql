-- Copied from drizzle/migrations/0012_document_quarantine_reason.sql (already applied on the live database).
-- Guarded: every statement is a no-op where the change is present.
-- Rollback (manual, only if ever required):
--   ALTER TABLE public.<table> DROP CONSTRAINT IF EXISTS <table>_quarantine_reason_check;
--   ALTER TABLE public.<table> DROP COLUMN IF EXISTS quarantine_reason;  -- for each of the five upload tables
--   and restore protect_upload_validation() from 20261025170000 or earlier.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['talent_private_documents','talent_shared_documents','talent_shared_document_versions','talent_invitation_documents','agency_compliance_documents'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS quarantine_reason text',t);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_quarantine_reason_check') THEN
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (quarantine_reason IS NULL OR (quarantine_reason IN (''blocked_type'',''failed_check'') AND validated_at IS NULL))',t,t||'_quarantine_reason_check');
  END IF;
  EXECUTE format('COMMENT ON COLUMN public.%I.quarantine_reason IS %L',t,'Set only by the server file checker: blocked_type or failed_check.');
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.protect_upload_validation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.role()='authenticated' THEN
  IF TG_OP='INSERT' AND (NEW.validated_at IS NOT NULL OR NEW.quarantine_reason IS NOT NULL) THEN RAISE EXCEPTION 'Only the file checker can validate an upload.'; END IF;
  IF TG_OP='UPDATE' AND (NEW.validated_at IS DISTINCT FROM OLD.validated_at OR NEW.quarantine_reason IS DISTINCT FROM OLD.quarantine_reason OR (to_jsonb(NEW)->'download_only') IS DISTINCT FROM (to_jsonb(OLD)->'download_only') OR (OLD.validated_at IS NOT NULL AND (NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes))) THEN RAISE EXCEPTION 'Validated file details cannot be changed. Upload a new version instead.'; END IF;
 END IF; RETURN NEW; END $$;