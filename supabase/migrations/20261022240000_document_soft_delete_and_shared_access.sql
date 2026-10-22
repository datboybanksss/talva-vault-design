-- Once shared always available to talent, platform retention minimum, soft delete with recovery, bulk-delete flags, protected storage.
-- Guarded (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS). Cron job 'purge-recently-deleted-documents' (hourly) scheduled separately via cron.schedule.
-- Rollback: cron.unschedule('purge-recently-deleted-documents'); drop triggers tsd_stamp_shared, tsd_guard_delete, link_accept_stamp_shared; drop storage policies 'Document files protected delete/update'; recreate previous 'Agency or talent read shared docs' policy without deleted_at/agency_removed_at; drop new functions, tables document_bulk_delete_flags, document_storage_purge_queue and added columns; restore previous trigger bodies from 20261022230000.
-- Columns ------------------------------------------------------------------
ALTER TABLE public.talent_shared_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS agency_removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_with_talent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sharing_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS sharing_stopped_by uuid,
  ADD COLUMN IF NOT EXISTS retention_min_years_at_upload integer;
ALTER TABLE public.talent_shared_document_versions
  ADD COLUMN IF NOT EXISTS retention_min_years_at_upload integer;

-- Backfill: every agency document already under an accepted link has been shared.
UPDATE public.talent_shared_documents d SET shared_with_talent_at = d.created_at
  FROM public.agency_talent_links l
 WHERE l.id = d.talent_link_id AND l.talent_user_id IS NOT NULL AND d.shared_with_talent_at IS NULL;

CREATE INDEX IF NOT EXISTS tsd_deleted_idx ON public.talent_shared_documents (agency_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- Bulk delete flags & storage purge queue -------------------------------------
CREATE TABLE IF NOT EXISTS public.document_bulk_delete_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  deleted_count integer NOT NULL,
  threshold integer NOT NULL,
  window_minutes integer NOT NULL,
  first_deleted_at timestamptz NOT NULL,
  last_deleted_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.document_bulk_delete_flags TO authenticated;
GRANT ALL ON public.document_bulk_delete_flags TO service_role;
ALTER TABLE public.document_bulk_delete_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read bulk delete flags" ON public.document_bulk_delete_flags;
CREATE POLICY "Admins read bulk delete flags" ON public.document_bulk_delete_flags
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin editors review bulk delete flags" ON public.document_bulk_delete_flags;
CREATE POLICY "Admin editors review bulk delete flags" ON public.document_bulk_delete_flags
  FOR UPDATE TO authenticated USING (public.can_admin_edit(auth.uid())) WITH CHECK (public.can_admin_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.document_storage_purge_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
GRANT ALL ON public.document_storage_purge_queue TO service_role;
ALTER TABLE public.document_storage_purge_queue ENABLE ROW LEVEL SECURITY;

-- Settings helper (admin-set values in platform_settings key 'documents'; null = not set)
CREATE OR REPLACE FUNCTION public.document_setting(_name text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(value->>_name, '')::integer FROM public.platform_settings WHERE key = 'documents'
$$;

-- Sharing stamp -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tsd_stamp_shared()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.originator <> 'talent' AND EXISTS (
      SELECT 1 FROM public.agency_talent_links l WHERE l.id = NEW.talent_link_id AND l.talent_user_id IS NOT NULL) THEN
      NEW.shared_with_talent_at := now();
    END IF;
  ELSE
    -- Once shared, always shared.
    IF OLD.shared_with_talent_at IS NOT NULL THEN NEW.shared_with_talent_at := OLD.shared_with_talent_at; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tsd_stamp_shared ON public.talent_shared_documents;
CREATE TRIGGER tsd_stamp_shared BEFORE INSERT OR UPDATE ON public.talent_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.tsd_stamp_shared();

CREATE OR REPLACE FUNCTION public.link_accept_stamp_shared()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.talent_user_id IS NOT NULL AND OLD.talent_user_id IS NULL THEN
    UPDATE public.talent_shared_documents SET shared_with_talent_at = now()
     WHERE talent_link_id = NEW.id AND shared_with_talent_at IS NULL AND originator <> 'talent';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS link_accept_stamp_shared ON public.agency_talent_links;
CREATE TRIGGER link_accept_stamp_shared AFTER UPDATE OF talent_user_id ON public.agency_talent_links
  FOR EACH ROW EXECUTE FUNCTION public.link_accept_stamp_shared();

-- Retention: platform minimum stamped at upload --------------------------------
CREATE OR REPLACE FUNCTION public.tsd_after_insert_refresh_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _min integer; _years integer;
BEGIN
  IF NEW.originator = 'talent' THEN RETURN NEW; END IF;
  SELECT * INTO _r FROM public.current_retention_rule(NEW.agency_id, NEW.folder, NEW.id);
  _min := public.document_setting('min_retention_years');
  _years := CASE WHEN _r.years IS NULL AND _min IS NULL THEN NULL ELSE GREATEST(COALESCE(_r.years, 0), COALESCE(_min, 0)) END;
  UPDATE public.talent_shared_documents
     SET locked_until = CASE WHEN _years IS NULL OR _years = 0 THEN NULL
                             ELSE NEW.created_at + make_interval(years => _years) END,
         retention_years_at_upload = _years,
         retention_rule_id = _r.rule_id,
         retention_min_years_at_upload = _min,
         retention_stamped_at = now()
   WHERE id = NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tsd_protect_retention_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.originator = 'talent' THEN
    NEW.locked_until := NULL; NEW.retention_years_at_upload := NULL;
    NEW.retention_stamped_at := NULL; NEW.retention_rule_id := NULL; NEW.retention_min_years_at_upload := NULL;
    RETURN NEW;
  END IF;
  IF OLD.retention_stamped_at IS NOT NULL OR OLD.locked_until IS NOT NULL THEN
    NEW.locked_until := OLD.locked_until;
    NEW.retention_years_at_upload := OLD.retention_years_at_upload;
    NEW.retention_stamped_at := OLD.retention_stamped_at;
    NEW.retention_rule_id := OLD.retention_rule_id;
    NEW.retention_min_years_at_upload := OLD.retention_min_years_at_upload;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tsdv_stamp_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.talent_shared_documents; _r record; _min integer; _years integer;
BEGIN
  SELECT * INTO d FROM public.talent_shared_documents WHERE id = NEW.document_id;
  IF NOT FOUND OR d.originator = 'talent' THEN RETURN NEW; END IF;
  IF NEW.storage_path = d.storage_path AND d.retention_stamped_at IS NOT NULL THEN
    NEW.locked_until := d.locked_until;
    NEW.retention_years_at_upload := d.retention_years_at_upload;
    NEW.retention_rule_id := d.retention_rule_id;
    NEW.retention_min_years_at_upload := d.retention_min_years_at_upload;
    NEW.retention_stamped_at := d.retention_stamped_at;
  ELSE
    SELECT * INTO _r FROM public.current_retention_rule(d.agency_id, d.folder, d.id);
    _min := public.document_setting('min_retention_years');
    _years := CASE WHEN _r.years IS NULL AND _min IS NULL THEN NULL ELSE GREATEST(COALESCE(_r.years, 0), COALESCE(_min, 0)) END;
    NEW.locked_until := CASE WHEN _years IS NULL OR _years = 0 THEN NULL ELSE now() + make_interval(years => _years) END;
    NEW.retention_years_at_upload := _years;
    NEW.retention_rule_id := _r.rule_id;
    NEW.retention_min_years_at_upload := _min;
    NEW.retention_stamped_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Agency rules can never be shorter than the minimum in force when saved.
CREATE OR REPLACE FUNCTION public.retention_rule_no_document_override()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _min integer := public.document_setting('min_retention_years');
BEGIN
  IF NEW.scope = 'document' AND (TG_OP = 'INSERT' OR NEW.retention_years IS DISTINCT FROM OLD.retention_years
       OR NEW.document_id IS DISTINCT FROM OLD.document_id) THEN
    RAISE EXCEPTION 'NO_RULE_OVERRIDE: per-document retention overrides are not allowed. Rules apply by folder to documents uploaded from now on.';
  END IF;
  IF _min IS NOT NULL AND NEW.retention_years < _min
     AND (TG_OP = 'INSERT' OR NEW.retention_years IS DISTINCT FROM OLD.retention_years) THEN
    RAISE EXCEPTION 'RETENTION_BELOW_MINIMUM: TalVault''s minimum retention period is % years.', _min;
  END IF;
  RETURN NEW;
END $$;

-- No direct deletion; only the scheduled purge of unshared, expired items --------
CREATE OR REPLACE FUNCTION public.tsd_guard_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('talvault.purge', true) = 'on'
     AND OLD.deleted_at IS NOT NULL AND OLD.purge_after IS NOT NULL AND OLD.purge_after <= now()
     AND OLD.shared_with_talent_at IS NULL
     AND (OLD.locked_until IS NULL OR OLD.locked_until <= now()) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'DOCUMENT_DELETE_REFUSED: documents are moved to Recently deleted, never removed directly.';
END $$;
DROP TRIGGER IF EXISTS tsd_guard_delete ON public.talent_shared_documents;
CREATE TRIGGER tsd_guard_delete BEFORE DELETE ON public.talent_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.tsd_guard_delete();

-- Agency no longer sees deleted / removed documents; talent access is unchanged.
DROP POLICY IF EXISTS "Agency or talent read shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency or talent read shared docs" ON public.talent_shared_documents
  FOR SELECT USING (
    (deleted_at IS NULL AND agency_removed_at IS NULL
      AND is_agency_member(auth.uid(), agency_id)
      AND ((talent_link_id IS NULL) OR can_access_talent_folder(auth.uid(), talent_link_id, is_restricted_folder_name(agency_id, folder))))
    OR talent_can_read_shared_doc(talent_link_id, originator, retention_years_at_upload)
  );

-- Files of documents/versions can't be deleted or overwritten through storage.
CREATE OR REPLACE FUNCTION public.storage_path_is_document(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.talent_shared_documents WHERE storage_path = _path)
      OR EXISTS (SELECT 1 FROM public.talent_shared_document_versions WHERE storage_path = _path)
$$;
DROP POLICY IF EXISTS "Document files protected delete" ON storage.objects;
CREATE POLICY "Document files protected delete" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'talent-documents' OR NOT public.storage_path_is_document(name));
DROP POLICY IF EXISTS "Document files protected update" ON storage.objects;
CREATE POLICY "Document files protected update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'talent-documents' OR NOT public.storage_path_is_document(name));

-- Audit helper ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_document_event(_doc public.talent_shared_documents, _action text, _actor uuid, _extra jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _talent text; _email text;
BEGIN
  SELECT display_name INTO _talent FROM public.agency_talent_links WHERE id = _doc.talent_link_id;
  SELECT email INTO _email FROM public.profiles WHERE id = _actor;
  INSERT INTO public.agency_audit_log (agency_id, actor_id, actor_email, action, target_type, target_id, target_label, detail)
  VALUES (_doc.agency_id, _actor, _email, _action, 'talent_shared_document', _doc.id::text, _doc.name,
          jsonb_build_object('folder', _doc.folder, 'talent_link_id', _doc.talent_link_id, 'talent_name', _talent) || _extra);
END $$;

-- Soft delete -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_agency_document(_doc_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.talent_shared_documents; _uid uuid := auth.uid(); _lock timestamptz;
        _days integer; _thr integer; _win integer; _n integer; _purge timestamptz; f record;
BEGIN
  SELECT * INTO d FROM public.talent_shared_documents WHERE id = _doc_id FOR UPDATE;
  IF NOT FOUND OR d.deleted_at IS NOT NULL OR d.agency_removed_at IS NOT NULL
     OR NOT public.is_agency_member(_uid, d.agency_id) THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND';
  END IF;
  IF public.account_paused(_uid) OR public.agency_staff_write_blocked(_uid, d.agency_id) THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
  IF NOT public.terms_write_allowed(_uid) THEN RAISE EXCEPTION 'TERMS_NOT_ACCEPTED'; END IF;
  IF d.originator = 'talent' THEN RAISE EXCEPTION 'TALENT_OWNED'; END IF;
  IF d.talent_link_id IS NOT NULL AND public.talent_link_is_ended(d.talent_link_id) THEN RAISE EXCEPTION 'RELATIONSHIP_ENDED'; END IF;
  IF d.talent_link_id IS NOT NULL AND NOT public.can_access_talent_folder(_uid, d.talent_link_id, public.is_restricted_folder_name(d.agency_id, d.folder)) THEN
    RAISE EXCEPTION 'NO_FOLDER_ACCESS';
  END IF;
  SELECT GREATEST(d.locked_until, MAX(v.locked_until)) INTO _lock FROM public.talent_shared_document_versions v WHERE v.document_id = d.id;
  _lock := COALESCE(_lock, d.locked_until);
  IF _lock IS NOT NULL AND _lock > now() THEN RAISE EXCEPTION 'RETENTION_LOCKED: %', _lock; END IF;

  _days := public.document_setting('recovery_days');
  _purge := CASE WHEN _days IS NULL THEN NULL ELSE now() + make_interval(days => _days) END;
  UPDATE public.talent_shared_documents SET deleted_at = now(), deleted_by = _uid, purge_after = _purge WHERE id = d.id;
  PERFORM public.log_document_event(d, 'document_moved_to_recently_deleted', _uid, jsonb_build_object('purge_after', _purge));

  _thr := public.document_setting('bulk_delete_threshold');
  _win := public.document_setting('bulk_delete_window_minutes');
  IF _thr IS NOT NULL AND _win IS NOT NULL THEN
    SELECT COUNT(*) INTO _n FROM public.talent_shared_documents
     WHERE agency_id = d.agency_id AND deleted_at >= now() - make_interval(mins => _win);
    IF _n > _thr THEN
      SELECT * INTO f FROM public.document_bulk_delete_flags
       WHERE agency_id = d.agency_id AND last_deleted_at >= now() - make_interval(mins => _win)
       ORDER BY created_at DESC LIMIT 1;
      IF FOUND THEN
        UPDATE public.document_bulk_delete_flags SET deleted_count = deleted_count + 1, last_deleted_at = now() WHERE id = f.id;
      ELSE
        INSERT INTO public.document_bulk_delete_flags (agency_id, deleted_count, threshold, window_minutes, first_deleted_at, last_deleted_at)
        SELECT d.agency_id, _n, _thr, _win, MIN(deleted_at), now() FROM public.talent_shared_documents
         WHERE agency_id = d.agency_id AND deleted_at >= now() - make_interval(mins => _win);
      END IF;
    END IF;
  END IF;
  RETURN _purge;
END $$;

CREATE OR REPLACE FUNCTION public.restore_deleted_document(_doc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.talent_shared_documents; _uid uuid := auth.uid(); _admin boolean;
BEGIN
  SELECT * INTO d FROM public.talent_shared_documents WHERE id = _doc_id FOR UPDATE;
  IF NOT FOUND OR d.deleted_at IS NULL OR d.agency_removed_at IS NOT NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
  _admin := public.can_admin_edit(_uid);
  IF NOT _admin THEN
    IF NOT public.has_agency_role(_uid, d.agency_id, 'owner') THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
    IF public.account_paused(_uid) OR public.agency_staff_write_blocked(_uid, d.agency_id) THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
  END IF;
  UPDATE public.talent_shared_documents SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL WHERE id = d.id;
  PERFORM public.log_document_event(d, 'document_restored', _uid, jsonb_build_object('by_admin', _admin));
END $$;

CREATE OR REPLACE FUNCTION public.list_recently_deleted_documents(_agency_id uuid)
RETURNS TABLE(id uuid, name text, folder text, talent_name text, deleted_at timestamptz, deleted_by_email text, purge_after timestamptz, shared_with_talent boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_agency_role(auth.uid(), _agency_id, 'owner')) THEN
    RAISE EXCEPTION 'OWNER_ONLY';
  END IF;
  RETURN QUERY
  SELECT d.id, d.name, d.folder, l.display_name, d.deleted_at, p.email, d.purge_after, d.shared_with_talent_at IS NOT NULL
    FROM public.talent_shared_documents d
    LEFT JOIN public.agency_talent_links l ON l.id = d.talent_link_id
    LEFT JOIN public.profiles p ON p.id = d.deleted_by
   WHERE d.agency_id = _agency_id AND d.deleted_at IS NOT NULL AND d.agency_removed_at IS NULL
   ORDER BY d.deleted_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.stop_sharing_document(_doc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.talent_shared_documents; _uid uuid := auth.uid();
BEGIN
  SELECT * INTO d FROM public.talent_shared_documents WHERE id = _doc_id FOR UPDATE;
  IF NOT FOUND OR d.deleted_at IS NOT NULL OR NOT public.is_agency_member(_uid, d.agency_id) THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
  IF public.account_paused(_uid) OR public.agency_staff_write_blocked(_uid, d.agency_id) THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
  IF d.originator = 'talent' THEN RAISE EXCEPTION 'TALENT_OWNED'; END IF;
  -- Only stops it appearing as newly shared/updated. Access and protection are untouched.
  UPDATE public.talent_shared_documents SET sharing_stopped_at = now(), sharing_stopped_by = _uid WHERE id = d.id;
  PERFORM public.log_document_event(d, 'document_sharing_stopped', _uid);
END $$;

-- Scheduled purge --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_recently_deleted_documents()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.talent_shared_documents; _n integer := 0;
BEGIN
  FOR d IN SELECT * FROM public.talent_shared_documents
            WHERE deleted_at IS NOT NULL AND agency_removed_at IS NULL
              AND purge_after IS NOT NULL AND purge_after <= now() LOOP
    IF d.shared_with_talent_at IS NOT NULL OR (d.locked_until IS NOT NULL AND d.locked_until > now())
       OR EXISTS (SELECT 1 FROM public.talent_shared_document_versions v WHERE v.document_id = d.id AND v.locked_until > now()) THEN
      -- Talent keeps access, so the file stays; it just leaves the agency's view.
      UPDATE public.talent_shared_documents SET agency_removed_at = now() WHERE id = d.id;
      PERFORM public.log_document_event(d, 'document_permanently_removed_from_agency', NULL, '{"file_kept": true}'::jsonb);
    ELSE
      INSERT INTO public.document_storage_purge_queue (bucket, path)
      SELECT 'talent-documents', p FROM (
        SELECT d.storage_path AS p UNION SELECT storage_path FROM public.talent_shared_document_versions WHERE document_id = d.id
      ) s WHERE p IS NOT NULL;
      PERFORM public.log_document_event(d, 'document_permanently_removed', NULL, '{"file_kept": false}'::jsonb);
      PERFORM set_config('talvault.purge', 'on', true);
      DELETE FROM public.talent_shared_documents WHERE id = d.id;
      PERFORM set_config('talvault.purge', 'off', true);
    END IF;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.purge_recently_deleted_documents() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_document_event(public.talent_shared_documents, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_agency_document(uuid), public.restore_deleted_document(uuid),
  public.list_recently_deleted_documents(uuid), public.stop_sharing_document(uuid) TO authenticated;