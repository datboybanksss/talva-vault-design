-- Simplify agency shared folder default structure (approved 23 Oct 2026). Only folder placement changes; Private Vault untouched; non-default folders untouched. Guarded no-op on re-run.
-- ROLLBACK: restore renamed rows from shared_folder_merge_map (action='renamed': old_folder_name/old_parent_folder_id), re-insert action='merged' rows via jsonb_populate_record(NULL::agency_talent_folders, old_row), reset document folders from shared_folder_merge_doc_map, restore folder_catalogue_subfolders from folder_catalogue_subfolders_backup_20261023.
CREATE TABLE IF NOT EXISTS public.shared_folder_merge_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  action text NOT NULL CHECK (action IN ('renamed', 'merged')),
  folder_id uuid NOT NULL,
  talent_link_id uuid NOT NULL,
  old_folder_name text NOT NULL,
  new_folder_name text NOT NULL,
  old_parent_folder_id uuid,
  old_row jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shared_folder_merge_doc_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  document_id uuid NOT NULL,
  old_folder_name text NOT NULL,
  new_folder_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shared_folder_merge_map TO authenticated;
GRANT SELECT ON public.shared_folder_merge_doc_map TO authenticated;
GRANT ALL ON public.shared_folder_merge_map TO service_role;
GRANT ALL ON public.shared_folder_merge_doc_map TO service_role;
ALTER TABLE public.shared_folder_merge_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_folder_merge_doc_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read merge map" ON public.shared_folder_merge_map;
CREATE POLICY "Admins read merge map" ON public.shared_folder_merge_map
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins read merge doc map" ON public.shared_folder_merge_doc_map;
CREATE POLICY "Admins read merge doc map" ON public.shared_folder_merge_doc_map
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE
  b constant text := 'simplify_2026_10_23';
  pair record;
  src record;
  tgt_id uuid;
  new_parent uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.shared_folder_merge_map WHERE batch = b)
     OR EXISTS (SELECT 1 FROM public.folder_catalogue_subfolders WHERE name = 'Bank Details & Confirmation') THEN
    RAISE NOTICE 'already applied';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.agency_talent_folders_backup_20261023 AS SELECT * FROM public.agency_talent_folders;
  CREATE TABLE IF NOT EXISTS public.folder_catalogue_subfolders_backup_20261023 AS SELECT * FROM public.folder_catalogue_subfolders;
  CREATE TABLE IF NOT EXISTS public.tsd_folder_backup_20261023 AS SELECT id, talent_link_id, folder FROM public.talent_shared_documents;
  ALTER TABLE public.agency_talent_folders_backup_20261023 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.folder_catalogue_subfolders_backup_20261023 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tsd_folder_backup_20261023 ENABLE ROW LEVEL SECURITY;

  FOR pair IN
    SELECT * FROM (VALUES
      (1, 'Banking Details',   'Bank Details & Confirmation', 'banking_tax_financial'),
      (2, 'Bank Confirmation', 'Bank Details & Confirmation', 'banking_tax_financial'),
      (3, 'Visas',             'Visas & Work Permits',        'travel_visas'),
      (4, 'Work Permits',      'Visas & Work Permits',        'travel_visas'),
      (5, 'Passport',          'ID / Passport',               'identity_personal')
    ) v(ord, src_name, tgt_name, tgt_slug) ORDER BY ord
  LOOP
    FOR src IN
      SELECT * FROM public.agency_talent_folders
       WHERE folder_name = pair.src_name AND source = 'default' AND parent_folder_id IS NOT NULL
    LOOP
      tgt_id := NULL;
      SELECT id INTO tgt_id FROM public.agency_talent_folders
       WHERE talent_link_id = src.talent_link_id AND folder_name = pair.tgt_name LIMIT 1;

      INSERT INTO public.shared_folder_merge_doc_map (batch, document_id, old_folder_name, new_folder_name)
        SELECT b, d.id, d.folder, pair.tgt_name FROM public.talent_shared_documents d
         WHERE d.talent_link_id = src.talent_link_id AND d.folder = src.folder_name;
      UPDATE public.talent_shared_documents SET folder = pair.tgt_name
       WHERE talent_link_id = src.talent_link_id AND folder = src.folder_name;

      IF tgt_id IS NULL THEN
        new_parent := NULL;
        SELECT id INTO new_parent FROM public.agency_talent_folders
         WHERE talent_link_id = src.talent_link_id AND parent_folder_id IS NULL
           AND category_slug = pair.tgt_slug LIMIT 1;
        INSERT INTO public.shared_folder_merge_map
          (batch, action, folder_id, talent_link_id, old_folder_name, new_folder_name, old_parent_folder_id, old_row)
          VALUES (b, 'renamed', src.id, src.talent_link_id, src.folder_name, pair.tgt_name, src.parent_folder_id, to_jsonb(src));
        UPDATE public.agency_talent_folders
           SET folder_name = pair.tgt_name,
               parent_folder_id = COALESCE(new_parent, src.parent_folder_id)
         WHERE id = src.id;
      ELSE
        INSERT INTO public.shared_folder_merge_map
          (batch, action, folder_id, talent_link_id, old_folder_name, new_folder_name, old_parent_folder_id, old_row)
          VALUES (b, 'merged', src.id, src.talent_link_id, src.folder_name, pair.tgt_name, src.parent_folder_id, to_jsonb(src));
        DELETE FROM public.agency_talent_folders WHERE id = src.id;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.folder_catalogue_subfolders SET name = 'Bank Details & Confirmation'
   WHERE category_slug = 'banking_tax_financial' AND name = 'Banking Details';
  UPDATE public.folder_catalogue_subfolders SET name = 'Visas & Work Permits'
   WHERE category_slug = 'travel_visas' AND name = 'Visas';
  DELETE FROM public.folder_catalogue_subfolders
   WHERE (category_slug = 'banking_tax_financial' AND name = 'Bank Confirmation')
      OR (category_slug = 'travel_visas' AND name IN ('Work Permits', 'Passport'));
  UPDATE public.folder_catalogue_subfolders
     SET kind = CASE WHEN
       (category_slug = 'identity_personal' AND name IN ('ID / Passport', 'Proof of Address', 'Driver''s Licence'))
       OR (category_slug = 'contracts_agreements' AND name IN ('Agency / Representation Agreement', 'Employment / Club Contracts', 'Performance / Appearance Agreements'))
       OR (category_slug = 'banking_tax_financial' AND name IN ('Bank Details & Confirmation', 'Tax Documents'))
       OR (category_slug = 'travel_visas' AND name = 'Visas & Work Permits')
     THEN 'default' ELSE 'optional' END
   WHERE kind IN ('default', 'optional');
END $$;