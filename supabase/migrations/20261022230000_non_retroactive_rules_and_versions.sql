-- Non-retroactive retention rules, no per-document overrides, immutable stamped versions.
-- Guarded (OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).
-- Rollback: restore previous bodies of tsd_after_insert_refresh_lock, tsd_protect_retention_lock, retention_rule_refresh_docs (see 2026 retention migrations); DROP TRIGGER tsdv_immutable, tsdv_stamp_retention ON talent_shared_document_versions; DROP TRIGGER retention_rule_no_document_override ON agency_retention_rules; drop the added columns and functions current_retention_rule, tsdv_stamp_retention, tsdv_immutable, retention_rule_no_document_override.
ALTER TABLE public.talent_shared_documents
  ADD COLUMN IF NOT EXISTS retention_rule_id uuid;
ALTER TABLE public.talent_shared_document_versions
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS retention_years_at_upload integer,
  ADD COLUMN IF NOT EXISTS retention_rule_id uuid,
  ADD COLUMN IF NOT EXISTS retention_stamped_at timestamptz;
COMMENT ON COLUMN public.talent_shared_documents.retention_rule_id IS 'Retention rule that applied at upload (copied, never recalculated).';
COMMENT ON COLUMN public.talent_shared_document_versions.locked_until IS 'Retention end for this version, stamped at upload from the rule then in force.';

-- Rule in force for a folder right now (largest retention wins).
CREATE OR REPLACE FUNCTION public.current_retention_rule(_agency_id uuid, _folder text, _doc_id uuid)
RETURNS TABLE(rule_id uuid, years integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.retention_years FROM public.agency_retention_rules r
   WHERE r.agency_id = _agency_id
     AND ((r.scope = 'folder' AND r.scope_value = _folder)
          OR (r.scope = 'document' AND r.document_id = _doc_id))
   ORDER BY r.retention_years DESC LIMIT 1
$$;

-- Stamp the rule once, at upload. Applies "no rule" too, so a later rule never reaches it.
CREATE OR REPLACE FUNCTION public.tsd_after_insert_refresh_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record;
BEGIN
  IF NEW.originator = 'talent' THEN RETURN NEW; END IF;
  SELECT * INTO _r FROM public.current_retention_rule(NEW.agency_id, NEW.folder, NEW.id);
  UPDATE public.talent_shared_documents
     SET locked_until = CASE WHEN _r.years IS NULL THEN NULL
                             ELSE NEW.created_at + make_interval(years => _r.years) END,
         retention_years_at_upload = _r.years,
         retention_rule_id = _r.rule_id,
         retention_stamped_at = now()
   WHERE id = NEW.id;
  RETURN NEW;
END $$;

-- Once stamped, a document's rule can never change (no override, not retroactive).
CREATE OR REPLACE FUNCTION public.tsd_protect_retention_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.originator = 'talent' THEN
    NEW.locked_until := NULL;
    NEW.retention_years_at_upload := NULL;
    NEW.retention_stamped_at := NULL;
    NEW.retention_rule_id := NULL;
    RETURN NEW;
  END IF;
  IF OLD.retention_stamped_at IS NOT NULL OR OLD.locked_until IS NOT NULL THEN
    NEW.locked_until := OLD.locked_until;
    NEW.retention_years_at_upload := OLD.retention_years_at_upload;
    NEW.retention_stamped_at := OLD.retention_stamped_at;
    NEW.retention_rule_id := OLD.retention_rule_id;
  END IF;
  RETURN NEW;
END $$;

-- Rule changes no longer touch existing documents.
CREATE OR REPLACE FUNCTION public.retention_rule_refresh_docs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Intentionally a no-op: rules apply only to documents uploaded after the change.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- No new per-document overrides.
CREATE OR REPLACE FUNCTION public.retention_rule_no_document_override()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scope = 'document' AND (TG_OP = 'INSERT' OR NEW.retention_years IS DISTINCT FROM OLD.retention_years
       OR NEW.document_id IS DISTINCT FROM OLD.document_id) THEN
    RAISE EXCEPTION 'NO_RULE_OVERRIDE: per-document retention overrides are not allowed. Rules apply by folder to documents uploaded from now on.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS retention_rule_no_document_override ON public.agency_retention_rules;
CREATE TRIGGER retention_rule_no_document_override BEFORE INSERT OR UPDATE ON public.agency_retention_rules
  FOR EACH ROW EXECUTE FUNCTION public.retention_rule_no_document_override();

-- Versions: stamped at upload, then immutable; locked versions can't be deleted.
CREATE OR REPLACE FUNCTION public.tsdv_stamp_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.talent_shared_documents; _r record;
BEGIN
  SELECT * INTO d FROM public.talent_shared_documents WHERE id = NEW.document_id;
  IF NOT FOUND OR d.originator = 'talent' THEN RETURN NEW; END IF;
  IF NEW.storage_path = d.storage_path AND d.retention_stamped_at IS NOT NULL THEN
    -- The original file being recorded as a version keeps the document's own rule.
    NEW.locked_until := d.locked_until;
    NEW.retention_years_at_upload := d.retention_years_at_upload;
    NEW.retention_rule_id := d.retention_rule_id;
    NEW.retention_stamped_at := d.retention_stamped_at;
  ELSE
    SELECT * INTO _r FROM public.current_retention_rule(d.agency_id, d.folder, d.id);
    NEW.locked_until := CASE WHEN _r.years IS NULL THEN NULL
                             ELSE now() + make_interval(years => _r.years) END;
    NEW.retention_years_at_upload := _r.years;
    NEW.retention_rule_id := _r.rule_id;
    NEW.retention_stamped_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tsdv_stamp_retention ON public.talent_shared_document_versions;
CREATE TRIGGER tsdv_stamp_retention BEFORE INSERT ON public.talent_shared_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.tsdv_stamp_retention();

CREATE OR REPLACE FUNCTION public.tsdv_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'VERSION_IMMUTABLE: earlier versions are kept exactly as uploaded.';
  END IF;
  IF OLD.locked_until IS NOT NULL AND OLD.locked_until > now() THEN
    RAISE EXCEPTION 'RETENTION_LOCKED: version % is protected until %', OLD.version_number, OLD.locked_until;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS tsdv_immutable ON public.talent_shared_document_versions;
CREATE TRIGGER tsdv_immutable BEFORE UPDATE OR DELETE ON public.talent_shared_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.tsdv_immutable();