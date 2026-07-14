
-- 1) Columns on talent_shared_documents
ALTER TABLE public.talent_shared_documents
  ADD COLUMN IF NOT EXISTS current_version_id uuid,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 2) Versions table
CREATE TABLE public.talent_shared_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.talent_shared_documents(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  storage_path text NOT NULL,
  name text NOT NULL,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_shared_document_versions TO authenticated;
GRANT ALL ON public.talent_shared_document_versions TO service_role;
ALTER TABLE public.talent_shared_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read versions"
  ON public.talent_shared_document_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talent_shared_documents d
    WHERE d.id = talent_shared_document_versions.document_id
      AND public.is_agency_member(auth.uid(), d.agency_id)
  ));

CREATE POLICY "Agency members insert versions"
  ON public.talent_shared_document_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.talent_shared_documents d
    WHERE d.id = talent_shared_document_versions.document_id
      AND public.is_agency_member(auth.uid(), d.agency_id)
  ));

-- 3) Retention rules
CREATE TYPE public.retention_scope AS ENUM ('folder','document');

CREATE TABLE public.agency_retention_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  scope public.retention_scope NOT NULL,
  scope_value text,
  document_id uuid REFERENCES public.talent_shared_documents(id) ON DELETE CASCADE,
  retention_years int NOT NULL CHECK (retention_years BETWEEN 0 AND 100),
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_scope_shape CHECK (
    (scope = 'folder'   AND scope_value IS NOT NULL AND document_id IS NULL)
    OR (scope = 'document' AND document_id IS NOT NULL AND scope_value IS NULL)
  )
);
CREATE UNIQUE INDEX agency_retention_rules_folder_uidx
  ON public.agency_retention_rules(agency_id, scope_value) WHERE scope='folder';
CREATE UNIQUE INDEX agency_retention_rules_document_uidx
  ON public.agency_retention_rules(document_id) WHERE scope='document';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_retention_rules TO authenticated;
GRANT ALL ON public.agency_retention_rules TO service_role;
ALTER TABLE public.agency_retention_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read retention rules"
  ON public.agency_retention_rules FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Owners manage retention rules"
  ON public.agency_retention_rules FOR ALL TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'))
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));

CREATE TRIGGER trg_retention_rules_touch
  BEFORE UPDATE ON public.agency_retention_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Compute effective locked_until for a single doc
CREATE OR REPLACE FUNCTION public.compute_document_locked_until(_doc_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(d.created_at + make_interval(years => r.retention_years))
  FROM public.talent_shared_documents d
  JOIN public.agency_retention_rules r
    ON r.agency_id = d.agency_id
   AND (
       (r.scope = 'document' AND r.document_id = d.id)
    OR (r.scope = 'folder'   AND r.scope_value = d.folder)
   )
  WHERE d.id = _doc_id
$$;

-- 5) After-insert on documents: set cache
CREATE OR REPLACE FUNCTION public.tsd_after_insert_refresh_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.talent_shared_documents
     SET locked_until = public.compute_document_locked_until(NEW.id)
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tsd_refresh_lock_after_insert
  AFTER INSERT ON public.talent_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.tsd_after_insert_refresh_lock();

-- 6) When a rule is inserted/updated/deleted, refresh affected docs
CREATE OR REPLACE FUNCTION public.retention_rule_refresh_docs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF r.scope = 'document' THEN
    UPDATE public.talent_shared_documents d
       SET locked_until = public.compute_document_locked_until(d.id)
     WHERE d.id = r.document_id;
  ELSE
    UPDATE public.talent_shared_documents d
       SET locked_until = public.compute_document_locked_until(d.id)
     WHERE d.agency_id = r.agency_id AND d.folder = r.scope_value;
  END IF;
  RETURN r;
END;
$$;
CREATE TRIGGER retention_rule_refresh_after
  AFTER INSERT OR UPDATE OR DELETE ON public.agency_retention_rules
  FOR EACH ROW EXECUTE FUNCTION public.retention_rule_refresh_docs();

-- 7) Enforce lock at DELETE — defense in depth beyond the server fn
CREATE OR REPLACE FUNCTION public.enforce_retention_lock_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_until IS NOT NULL AND OLD.locked_until > now() THEN
    RAISE EXCEPTION 'RETENTION_LOCKED: document is locked until %', OLD.locked_until;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER enforce_retention_lock_on_delete
  BEFORE DELETE ON public.talent_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_retention_lock_delete();
