-- 1. Permanent, append-only rename log -------------------------------------
CREATE TABLE IF NOT EXISTS public.folder_rename_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  batch_label text NOT NULL,
  source_table text NOT NULL,
  row_id uuid,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  row_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS folder_rename_migration_log_batch_idx
  ON public.folder_rename_migration_log (batch_id);

GRANT SELECT ON public.folder_rename_migration_log TO authenticated;
GRANT ALL ON public.folder_rename_migration_log TO service_role;
ALTER TABLE public.folder_rename_migration_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read folder rename migration log" ON public.folder_rename_migration_log;
CREATE POLICY "Admins can read folder rename migration log"
  ON public.folder_rename_migration_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Backfill the true before-state of the earlier rename (batch v1) --------
INSERT INTO public.folder_rename_migration_log
  (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value, row_snapshot, created_at)
SELECT '11111111-1111-4111-8111-111111111111'::uuid,
       'taxonomy_v1',
       l.table_name,
       l.record_id,
       l.column_name,
       l.old_value,
       l.new_value,
       l.row_snapshot,
       l.created_at
FROM public.folder_taxonomy_rename_log l
WHERE l.migration_key = 'taxonomy_v1'
  AND NOT EXISTS (
    SELECT 1 FROM public.folder_rename_migration_log m
    WHERE m.batch_id = '11111111-1111-4111-8111-111111111111'::uuid
  );

-- 3. Sweep pass (batch v2): log BEFORE updating, all in this transaction ----
DO $sweep$
DECLARE
  b uuid := '22222222-2222-4222-8222-222222222222'::uuid;
BEGIN
  -- agency_talent_folders.folder_name
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
  SELECT b, 'taxonomy_v2', 'agency_talent_folders', f.id, 'folder_name',
         f.folder_name, public.tv_map_legacy_folder(f.folder_name)
  FROM public.agency_talent_folders f
  WHERE public.tv_map_legacy_folder(f.folder_name) IS NOT NULL;

  UPDATE public.agency_talent_folders f
     SET folder_name = public.tv_map_legacy_folder(f.folder_name)
   WHERE public.tv_map_legacy_folder(f.folder_name) IS NOT NULL;

  -- talent_shared_documents.folder (drives the M6 contract view)
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
  SELECT b, 'taxonomy_v2', 'talent_shared_documents', d.id, 'folder',
         d.folder, public.tv_map_legacy_folder(d.folder)
  FROM public.talent_shared_documents d
  WHERE public.tv_map_legacy_folder(d.folder) IS NOT NULL;

  UPDATE public.talent_shared_documents d
     SET folder = public.tv_map_legacy_folder(d.folder)
   WHERE public.tv_map_legacy_folder(d.folder) IS NOT NULL;

  -- agency_folder_template_items.folder_name
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
  SELECT b, 'taxonomy_v2', 'agency_folder_template_items', t.id, 'folder_name',
         t.folder_name, public.tv_map_legacy_folder(t.folder_name)
  FROM public.agency_folder_template_items t
  WHERE public.tv_map_legacy_folder(t.folder_name) IS NOT NULL;

  UPDATE public.agency_folder_template_items t
     SET folder_name = public.tv_map_legacy_folder(t.folder_name)
   WHERE public.tv_map_legacy_folder(t.folder_name) IS NOT NULL;

  -- agency_folder_settings.folder_name
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
  SELECT b, 'taxonomy_v2', 'agency_folder_settings', s.id, 'folder_name',
         s.folder_name, public.tv_map_legacy_folder(s.folder_name)
  FROM public.agency_folder_settings s
  WHERE public.tv_map_legacy_folder(s.folder_name) IS NOT NULL;

  UPDATE public.agency_folder_settings s
     SET folder_name = public.tv_map_legacy_folder(s.folder_name)
   WHERE public.tv_map_legacy_folder(s.folder_name) IS NOT NULL;

  -- agency_document_requests.folder
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
  SELECT b, 'taxonomy_v2', 'agency_document_requests', r.id, 'folder',
         r.folder, public.tv_map_legacy_folder(r.folder)
  FROM public.agency_document_requests r
  WHERE public.tv_map_legacy_folder(r.folder) IS NOT NULL;

  UPDATE public.agency_document_requests r
     SET folder = public.tv_map_legacy_folder(r.folder)
   WHERE public.tv_map_legacy_folder(r.folder) IS NOT NULL;

  -- agency_retention_rules.scope_value (folder-scoped retention rules)
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
  SELECT b, 'taxonomy_v2', 'agency_retention_rules', rr.id, 'scope_value',
         rr.scope_value, public.tv_map_legacy_folder(rr.scope_value)
  FROM public.agency_retention_rules rr
  WHERE rr.scope = 'folder'::retention_scope
    AND public.tv_map_legacy_folder(rr.scope_value) IS NOT NULL;

  UPDATE public.agency_retention_rules rr
     SET scope_value = public.tv_map_legacy_folder(rr.scope_value)
   WHERE rr.scope = 'folder'::retention_scope
     AND public.tv_map_legacy_folder(rr.scope_value) IS NOT NULL;

  -- talent_invitations.folder_selection (jsonb array of {name,...})
  INSERT INTO public.folder_rename_migration_log
    (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value, row_snapshot)
  SELECT b, 'taxonomy_v2', 'talent_invitations', i.id, 'folder_selection',
         i.folder_selection::text,
         (
           SELECT jsonb_agg(
             CASE WHEN public.tv_map_legacy_folder(e->>'name') IS NOT NULL
                  THEN jsonb_set(e, '{name}', to_jsonb(public.tv_map_legacy_folder(e->>'name')))
                  ELSE e END
             ORDER BY ord)
           FROM jsonb_array_elements(i.folder_selection) WITH ORDINALITY AS x(e, ord)
         )::text,
         i.folder_selection
  FROM public.talent_invitations i
  WHERE jsonb_typeof(i.folder_selection) = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.folder_selection) e
      WHERE public.tv_map_legacy_folder(e->>'name') IS NOT NULL
    );

  UPDATE public.talent_invitations i
     SET folder_selection = (
       SELECT jsonb_agg(
         CASE WHEN public.tv_map_legacy_folder(e->>'name') IS NOT NULL
              THEN jsonb_set(e, '{name}', to_jsonb(public.tv_map_legacy_folder(e->>'name')))
              ELSE e END
         ORDER BY ord)
       FROM jsonb_array_elements(i.folder_selection) WITH ORDINALITY AS x(e, ord)
     )
   WHERE jsonb_typeof(i.folder_selection) = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(i.folder_selection) e
       WHERE public.tv_map_legacy_folder(e->>'name') IS NOT NULL
     );
END;
$sweep$;

-- 4. Explicit down-migration / rollback routine ----------------------------
CREATE OR REPLACE FUNCTION public.rollback_folder_rename_batch(_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE l RECORD; n integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_main_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR l IN
    SELECT * FROM public.folder_rename_migration_log
    WHERE batch_id = _batch_id
    ORDER BY created_at DESC, id DESC
  LOOP
    IF l.column_name = '__deleted_row' AND l.source_table = 'agency_talent_folders' THEN
      INSERT INTO public.agency_talent_folders
        SELECT * FROM jsonb_populate_record(NULL::public.agency_talent_folders, l.row_snapshot)
      ON CONFLICT DO NOTHING;
    ELSIF l.source_table = 'agency_talent_folders' THEN
      UPDATE public.agency_talent_folders SET folder_name = l.old_value WHERE id = l.row_id;
    ELSIF l.source_table = 'talent_shared_documents' THEN
      UPDATE public.talent_shared_documents SET folder = l.old_value WHERE id = l.row_id;
    ELSIF l.source_table = 'agency_folder_template_items' THEN
      UPDATE public.agency_folder_template_items SET folder_name = l.old_value WHERE id = l.row_id;
    ELSIF l.source_table = 'agency_folder_settings' THEN
      UPDATE public.agency_folder_settings SET folder_name = l.old_value WHERE id = l.row_id;
    ELSIF l.source_table = 'agency_document_requests' THEN
      UPDATE public.agency_document_requests SET folder = l.old_value WHERE id = l.row_id;
    ELSIF l.source_table = 'agency_retention_rules' THEN
      UPDATE public.agency_retention_rules SET scope_value = l.old_value WHERE id = l.row_id;
    ELSIF l.source_table = 'talent_invitations' THEN
      UPDATE public.talent_invitations
         SET folder_selection = COALESCE(l.row_snapshot, l.old_value::jsonb)
       WHERE id = l.row_id;
    END IF;
    n := n + 1;
  END LOOP;

  -- The log is deliberately retained after rollback (no timed cleanup).
  RETURN n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rollback_folder_rename_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_folder_rename_batch(uuid) TO service_role;

-- 5. Self-test the rollback routine against real rows (same transaction) ---
DO $test$
DECLARE
  tb uuid := '99999999-9999-4999-8999-999999999999'::uuid;
  f_id uuid; f_before text;
  d_id uuid; d_before text;
  r_id uuid; r_before text;
  i_id uuid; i_before jsonb;
  restored integer;
BEGIN
  SELECT id, folder_name INTO f_id, f_before FROM public.agency_talent_folders LIMIT 1;
  SELECT id, folder INTO d_id, d_before FROM public.talent_shared_documents
    WHERE folder = 'Contracts & Agreements' LIMIT 1;
  SELECT id, scope_value INTO r_id, r_before FROM public.agency_retention_rules
    WHERE scope = 'folder'::retention_scope LIMIT 1;
  SELECT id, folder_selection INTO i_id, i_before FROM public.talent_invitations
    WHERE jsonb_typeof(folder_selection) = 'array' AND jsonb_array_length(folder_selection) > 0 LIMIT 1;

  IF f_id IS NOT NULL THEN
    INSERT INTO public.folder_rename_migration_log
      (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
    VALUES (tb, 'selftest', 'agency_talent_folders', f_id, 'folder_name', f_before, '__SELFTEST__');
    UPDATE public.agency_talent_folders SET folder_name = '__SELFTEST__' WHERE id = f_id;
  END IF;

  IF d_id IS NOT NULL THEN
    INSERT INTO public.folder_rename_migration_log
      (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
    VALUES (tb, 'selftest', 'talent_shared_documents', d_id, 'folder', d_before, '__SELFTEST__');
    UPDATE public.talent_shared_documents SET folder = '__SELFTEST__' WHERE id = d_id;
  END IF;

  IF r_id IS NOT NULL THEN
    INSERT INTO public.folder_rename_migration_log
      (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value)
    VALUES (tb, 'selftest', 'agency_retention_rules', r_id, 'scope_value', r_before, '__SELFTEST__');
    UPDATE public.agency_retention_rules SET scope_value = '__SELFTEST__' WHERE id = r_id;
  END IF;

  IF i_id IS NOT NULL THEN
    INSERT INTO public.folder_rename_migration_log
      (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value, row_snapshot)
    VALUES (tb, 'selftest', 'talent_invitations', i_id, 'folder_selection',
            i_before::text, '[]', i_before);
    UPDATE public.talent_invitations SET folder_selection = '[]'::jsonb WHERE id = i_id;
  END IF;

  restored := public.rollback_folder_rename_batch(tb);

  IF f_id IS NOT NULL AND (SELECT folder_name FROM public.agency_talent_folders WHERE id = f_id) IS DISTINCT FROM f_before THEN
    RAISE EXCEPTION 'rollback self-test failed: agency_talent_folders not restored';
  END IF;
  IF d_id IS NOT NULL AND (SELECT folder FROM public.talent_shared_documents WHERE id = d_id) IS DISTINCT FROM d_before THEN
    RAISE EXCEPTION 'rollback self-test failed: talent_shared_documents not restored';
  END IF;
  IF r_id IS NOT NULL AND (SELECT scope_value FROM public.agency_retention_rules WHERE id = r_id) IS DISTINCT FROM r_before THEN
    RAISE EXCEPTION 'rollback self-test failed: agency_retention_rules not restored';
  END IF;
  IF i_id IS NOT NULL AND (SELECT folder_selection FROM public.talent_invitations WHERE id = i_id) IS DISTINCT FROM i_before THEN
    RAISE EXCEPTION 'rollback self-test failed: talent_invitations not restored';
  END IF;

  RAISE NOTICE 'rollback self-test passed (% log rows replayed)', restored;
  DELETE FROM public.folder_rename_migration_log WHERE batch_id = tb;
END;
$test$;