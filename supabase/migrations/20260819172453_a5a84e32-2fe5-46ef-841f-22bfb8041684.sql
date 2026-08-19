-- 1. Reversible audit log -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.folder_taxonomy_rename_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_key text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  row_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.folder_taxonomy_rename_log TO authenticated;
GRANT ALL ON public.folder_taxonomy_rename_log TO service_role;
ALTER TABLE public.folder_taxonomy_rename_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read folder rename log" ON public.folder_taxonomy_rename_log;
CREATE POLICY "Admins can read folder rename log"
  ON public.folder_taxonomy_rename_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Mapping ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tv_map_legacy_folder(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _name
    WHEN 'ID Documents'         THEN 'Identity & Personal'
    WHEN 'Certified Documents'  THEN 'Rights, Licences & Compliance'
    WHEN 'Compliance'           THEN 'Rights, Licences & Compliance'
    WHEN 'Contracts'            THEN 'Contracts & Agreements'
    WHEN 'Tax'                  THEN 'Banking, Tax & Financial'
    WHEN 'Proof of Accounts'    THEN 'Banking, Tax & Financial'
    WHEN 'Invoices'             THEN 'Banking, Tax & Financial'
    WHEN 'Travel'               THEN 'Travel & Visas'
    WHEN 'Sponsorships'         THEN 'Brand, Sponsorship & Media'
    WHEN 'Endorsements'         THEN 'Brand, Sponsorship & Media'
    WHEN 'Property'             THEN 'Other Documents'
    WHEN 'Other'                THEN 'Other Documents'
    ELSE NULL
  END
$$;

-- 3. Apply ---------------------------------------------------------------------
DO $mig$
DECLARE
  k text := 'taxonomy_v1';
  r RECORD;
  newname text;
  newsel jsonb;
BEGIN
  -- 3a. agency_talent_folders: merge duplicates first, then rename
  FOR r IN
    SELECT f.* FROM public.agency_talent_folders f
    WHERE public.tv_map_legacy_folder(f.folder_name) IS NOT NULL
    ORDER BY f.created_at
  LOOP
    newname := public.tv_map_legacy_folder(r.folder_name);
    IF EXISTS (
      SELECT 1 FROM public.agency_talent_folders x
      WHERE x.talent_link_id = r.talent_link_id
        AND x.id <> r.id
        AND (x.folder_name = newname
             OR public.tv_map_legacy_folder(x.folder_name) = newname AND x.created_at < r.created_at)
    ) THEN
      INSERT INTO public.folder_taxonomy_rename_log
        (migration_key, table_name, record_id, column_name, old_value, new_value, row_snapshot)
      VALUES (k, 'agency_talent_folders', r.id, '__deleted_row', r.folder_name, newname, to_jsonb(r));
      DELETE FROM public.agency_talent_folders WHERE id = r.id;
    ELSE
      INSERT INTO public.folder_taxonomy_rename_log
        (migration_key, table_name, record_id, column_name, old_value, new_value)
      VALUES (k, 'agency_talent_folders', r.id, 'folder_name', r.folder_name, newname);
      UPDATE public.agency_talent_folders SET folder_name = newname WHERE id = r.id;
    END IF;
  END LOOP;

  -- 3b. talent_shared_documents.folder
  FOR r IN
    SELECT id, folder FROM public.talent_shared_documents
    WHERE public.tv_map_legacy_folder(folder) IS NOT NULL
  LOOP
    newname := public.tv_map_legacy_folder(r.folder);
    INSERT INTO public.folder_taxonomy_rename_log
      (migration_key, table_name, record_id, column_name, old_value, new_value)
    VALUES (k, 'talent_shared_documents', r.id, 'folder', r.folder, newname);
    UPDATE public.talent_shared_documents SET folder = newname WHERE id = r.id;
  END LOOP;

  -- 3c. agency_folder_template_items.folder_name
  FOR r IN
    SELECT id, folder_name FROM public.agency_folder_template_items
    WHERE public.tv_map_legacy_folder(folder_name) IS NOT NULL
  LOOP
    newname := public.tv_map_legacy_folder(r.folder_name);
    INSERT INTO public.folder_taxonomy_rename_log
      (migration_key, table_name, record_id, column_name, old_value, new_value)
    VALUES (k, 'agency_folder_template_items', r.id, 'folder_name', r.folder_name, newname);
    UPDATE public.agency_folder_template_items SET folder_name = newname WHERE id = r.id;
  END LOOP;

  -- 3d. agency_document_requests.folder
  FOR r IN
    SELECT id, folder FROM public.agency_document_requests
    WHERE public.tv_map_legacy_folder(folder) IS NOT NULL
  LOOP
    newname := public.tv_map_legacy_folder(r.folder);
    INSERT INTO public.folder_taxonomy_rename_log
      (migration_key, table_name, record_id, column_name, old_value, new_value)
    VALUES (k, 'agency_document_requests', r.id, 'folder', r.folder, newname);
    UPDATE public.agency_document_requests SET folder = newname WHERE id = r.id;
  END LOOP;

  -- 3e. agency_retention_rules.scope_value (folder-scoped rules)
  FOR r IN
    SELECT id, scope_value FROM public.agency_retention_rules
    WHERE scope = 'folder' AND public.tv_map_legacy_folder(scope_value) IS NOT NULL
  LOOP
    newname := public.tv_map_legacy_folder(r.scope_value);
    INSERT INTO public.folder_taxonomy_rename_log
      (migration_key, table_name, record_id, column_name, old_value, new_value)
    VALUES (k, 'agency_retention_rules', r.id, 'scope_value', r.scope_value, newname);
    UPDATE public.agency_retention_rules SET scope_value = newname WHERE id = r.id;
  END LOOP;

  -- 3f. talent_invitations.folder_selection (jsonb array of {name,...})
  FOR r IN
    SELECT id, folder_selection FROM public.talent_invitations
    WHERE jsonb_typeof(folder_selection) = 'array'
  LOOP
    SELECT jsonb_agg(
             CASE WHEN public.tv_map_legacy_folder(e->>'name') IS NOT NULL
                  THEN jsonb_set(e, '{name}', to_jsonb(public.tv_map_legacy_folder(e->>'name')))
                  ELSE e END
             ORDER BY ord)
      INTO newsel
      FROM jsonb_array_elements(r.folder_selection) WITH ORDINALITY AS t(e, ord);

    IF newsel IS NOT NULL AND newsel <> r.folder_selection THEN
      INSERT INTO public.folder_taxonomy_rename_log
        (migration_key, table_name, record_id, column_name, old_value, new_value, row_snapshot)
      VALUES (k, 'talent_invitations', r.id, 'folder_selection',
              r.folder_selection::text, newsel::text, r.folder_selection);
      UPDATE public.talent_invitations SET folder_selection = newsel WHERE id = r.id;
    END IF;
  END LOOP;
END
$mig$;

-- 4. Rollback ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_folder_taxonomy_rename(_migration_key text DEFAULT 'taxonomy_v1')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l RECORD; n int := 0;
BEGIN
  IF NOT public.is_main_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR l IN
    SELECT * FROM public.folder_taxonomy_rename_log
    WHERE migration_key = _migration_key
    ORDER BY created_at DESC
  LOOP
    IF l.column_name = '__deleted_row' THEN
      INSERT INTO public.agency_talent_folders
        SELECT * FROM jsonb_populate_record(NULL::public.agency_talent_folders, l.row_snapshot)
        ON CONFLICT DO NOTHING;
    ELSIF l.table_name = 'agency_talent_folders' THEN
      UPDATE public.agency_talent_folders SET folder_name = l.old_value WHERE id = l.record_id;
    ELSIF l.table_name = 'talent_shared_documents' THEN
      UPDATE public.talent_shared_documents SET folder = l.old_value WHERE id = l.record_id;
    ELSIF l.table_name = 'agency_folder_template_items' THEN
      UPDATE public.agency_folder_template_items SET folder_name = l.old_value WHERE id = l.record_id;
    ELSIF l.table_name = 'agency_document_requests' THEN
      UPDATE public.agency_document_requests SET folder = l.old_value WHERE id = l.record_id;
    ELSIF l.table_name = 'agency_retention_rules' THEN
      UPDATE public.agency_retention_rules SET scope_value = l.old_value WHERE id = l.record_id;
    ELSIF l.table_name = 'talent_invitations' THEN
      UPDATE public.talent_invitations SET folder_selection = l.row_snapshot WHERE id = l.record_id;
    END IF;
    n := n + 1;
  END LOOP;

  DELETE FROM public.folder_taxonomy_rename_log WHERE migration_key = _migration_key;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_folder_taxonomy_rename(text) FROM PUBLIC, anon, authenticated;
