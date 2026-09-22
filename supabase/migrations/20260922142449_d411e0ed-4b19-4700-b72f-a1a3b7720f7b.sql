-- =====================================================================
-- 1. RETENTION: stamp retention at upload; never shorten retroactively
-- =====================================================================

ALTER TABLE public.talent_shared_documents
  ADD COLUMN IF NOT EXISTS retention_years_at_upload integer,
  ADD COLUMN IF NOT EXISTS retention_stamped_at timestamp with time zone;

-- Backfill the stamp for documents that already carry a computed lock.
UPDATE public.talent_shared_documents d
   SET retention_stamped_at = COALESCE(d.retention_stamped_at, d.created_at),
       retention_years_at_upload = COALESCE(
         d.retention_years_at_upload,
         GREATEST(0, (EXTRACT(YEAR FROM age(d.locked_until, d.created_at)))::int)
       )
 WHERE d.locked_until IS NOT NULL;

-- Resolve the retention years that currently apply to a document's scope.
CREATE OR REPLACE FUNCTION public.resolve_document_retention_years(_doc_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT MAX(r.retention_years)
  FROM public.talent_shared_documents d
  JOIN public.agency_retention_rules r
    ON r.agency_id = d.agency_id
   AND (
       (r.scope = 'document' AND r.document_id = d.id)
    OR (r.scope = 'folder'   AND r.scope_value = d.folder)
   )
  WHERE d.id = _doc_id
$$;

REVOKE ALL ON FUNCTION public.resolve_document_retention_years(uuid) FROM PUBLIC, anon, authenticated;

-- Stamp the lock once, at upload time, from the rules in force at that moment.
CREATE OR REPLACE FUNCTION public.tsd_after_insert_refresh_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _years integer;
BEGIN
  _years := public.resolve_document_retention_years(NEW.id);
  IF _years IS NOT NULL THEN
    UPDATE public.talent_shared_documents
       SET locked_until = NEW.created_at + make_interval(years => _years),
           retention_years_at_upload = _years,
           retention_stamped_at = now()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Rule changes may only EXTEND locks on existing documents. Rule deletion is a no-op.
CREATE OR REPLACE FUNCTION public.retention_rule_refresh_docs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  -- Deleting a rule must never clear or shorten an already-stamped lock.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  r := NEW;

  IF r.scope = 'document' THEN
    UPDATE public.talent_shared_documents d
       SET locked_until = d.created_at + make_interval(years => r.retention_years),
           retention_years_at_upload = r.retention_years,
           retention_stamped_at = now()
     WHERE d.id = r.document_id
       AND (
         d.locked_until IS NULL
         OR d.created_at + make_interval(years => r.retention_years) > d.locked_until
       );
  ELSE
    UPDATE public.talent_shared_documents d
       SET locked_until = d.created_at + make_interval(years => r.retention_years),
           retention_years_at_upload = r.retention_years,
           retention_stamped_at = now()
     WHERE d.agency_id = r.agency_id
       AND d.folder = r.scope_value
       AND (
         d.locked_until IS NULL
         OR d.created_at + make_interval(years => r.retention_years) > d.locked_until
       );
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.retention_rule_refresh_docs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tsd_after_insert_refresh_lock() FROM PUBLIC, anon, authenticated;

-- A stamped lock can never be reduced or cleared by any direct update either.
CREATE OR REPLACE FUNCTION public.tsd_protect_retention_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.locked_until IS NOT NULL
     AND (NEW.locked_until IS NULL OR NEW.locked_until < OLD.locked_until) THEN
    NEW.locked_until := OLD.locked_until;
  END IF;
  IF OLD.retention_years_at_upload IS NOT NULL
     AND (NEW.retention_years_at_upload IS NULL
          OR NEW.retention_years_at_upload < OLD.retention_years_at_upload) THEN
    NEW.retention_years_at_upload := OLD.retention_years_at_upload;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tsd_protect_retention_lock ON public.talent_shared_documents;
CREATE TRIGGER tsd_protect_retention_lock
  BEFORE UPDATE ON public.talent_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.tsd_protect_retention_lock();

-- =====================================================================
-- 2. OFFBOARDING LOCKDOWN: ended relationships are read-only
-- =====================================================================

CREATE OR REPLACE FUNCTION public.talent_link_is_ended(_talent_link_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT l.status IN ('ended', 'revoked', 'expired')
       FROM public.agency_talent_links l
      WHERE l.id = _talent_link_id),
    false)
$$;

GRANT EXECUTE ON FUNCTION public.talent_link_is_ended(uuid) TO authenticated;

-- ---- shared documents: writes blocked once the relationship has ended ----
DROP POLICY IF EXISTS "Agency writes shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency writes shared docs"
ON public.talent_shared_documents FOR INSERT TO authenticated
WITH CHECK (
  is_agency_member(auth.uid(), agency_id)
  AND (talent_link_id IS NULL OR NOT public.talent_link_is_ended(talent_link_id))
);

DROP POLICY IF EXISTS "Agency updates shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency updates shared docs"
ON public.talent_shared_documents FOR UPDATE TO authenticated
USING (
  is_agency_member(auth.uid(), agency_id)
  AND (talent_link_id IS NULL OR NOT public.talent_link_is_ended(talent_link_id))
  AND (talent_link_id IS NULL OR can_access_talent_folder(auth.uid(), talent_link_id, is_restricted_folder_name(agency_id, folder)))
);

DROP POLICY IF EXISTS "Agency deletes shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency deletes shared docs"
ON public.talent_shared_documents FOR DELETE TO authenticated
USING (
  is_agency_member(auth.uid(), agency_id)
  AND (talent_link_id IS NULL OR NOT public.talent_link_is_ended(talent_link_id))
  AND (talent_link_id IS NULL OR can_access_talent_folder(auth.uid(), talent_link_id, is_restricted_folder_name(agency_id, folder)))
);

-- ---- versions ----
DROP POLICY IF EXISTS "Agency members insert versions" ON public.talent_shared_document_versions;
CREATE POLICY "Agency members insert versions"
ON public.talent_shared_document_versions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.talent_shared_documents d
     WHERE d.id = talent_shared_document_versions.document_id
       AND is_agency_member(auth.uid(), d.agency_id)
       AND (d.talent_link_id IS NULL OR NOT public.talent_link_is_ended(d.talent_link_id))
  )
);

-- ---- talent folders ----
DROP POLICY IF EXISTS "Agency members insert own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members insert own agency talent folders"
ON public.agency_talent_folders FOR INSERT TO authenticated
WITH CHECK (
  is_agency_member(auth.uid(), agency_id)
  AND NOT public.talent_link_is_ended(talent_link_id)
);

DROP POLICY IF EXISTS "Agency members update own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members update own agency talent folders"
ON public.agency_talent_folders FOR UPDATE TO authenticated
USING (
  is_agency_member(auth.uid(), agency_id)
  AND can_access_talent_folder(auth.uid(), talent_link_id, restricted)
  AND NOT public.talent_link_is_ended(talent_link_id)
);

DROP POLICY IF EXISTS "Agency members delete own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members delete own agency talent folders"
ON public.agency_talent_folders FOR DELETE TO authenticated
USING (
  is_agency_member(auth.uid(), agency_id)
  AND can_access_talent_folder(auth.uid(), talent_link_id, restricted)
  AND NOT public.talent_link_is_ended(talent_link_id)
);

-- ---- document requests ----
DROP POLICY IF EXISTS "Agency members write requests" ON public.agency_document_requests;
CREATE POLICY "Agency members write requests"
ON public.agency_document_requests FOR INSERT TO authenticated
WITH CHECK (
  is_agency_member(auth.uid(), agency_id)
  AND NOT public.talent_link_is_ended(talent_link_id)
);

DROP POLICY IF EXISTS "Agency members update requests" ON public.agency_document_requests;
CREATE POLICY "Agency members update requests"
ON public.agency_document_requests FOR UPDATE TO authenticated
USING (
  is_agency_member(auth.uid(), agency_id)
  AND NOT public.talent_link_is_ended(talent_link_id)
)
WITH CHECK (
  is_agency_member(auth.uid(), agency_id)
  AND NOT public.talent_link_is_ended(talent_link_id)
);

DROP POLICY IF EXISTS "Agency members delete requests" ON public.agency_document_requests;
CREATE POLICY "Agency members delete requests"
ON public.agency_document_requests FOR DELETE TO authenticated
USING (
  is_agency_member(auth.uid(), agency_id)
  AND NOT public.talent_link_is_ended(talent_link_id)
);