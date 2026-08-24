-- ============================================================
-- Talent Private Vault folder catalogue
-- Plumbing only: relocates the existing taxonomy into the DB.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.talent_vault_catalogue_categories (
  slug        text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  icon        text NOT NULL,
  tone        text NOT NULL,
  sort_order  integer NOT NULL,
  is_starter  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.talent_vault_catalogue_categories TO authenticated;
GRANT ALL    ON public.talent_vault_catalogue_categories TO service_role;
ALTER TABLE public.talent_vault_catalogue_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read talent vault categories"
  ON public.talent_vault_catalogue_categories;
CREATE POLICY "Signed-in users can read talent vault categories"
  ON public.talent_vault_catalogue_categories FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.talent_vault_catalogue_subfolders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug text NOT NULL REFERENCES public.talent_vault_catalogue_categories(slug) ON DELETE CASCADE,
  -- NULL = sits directly under the category; otherwise the group it belongs to
  parent_name   text,
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'folder' CHECK (kind IN ('group', 'folder')),
  sort_order    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_slug, parent_name, name)
);

CREATE INDEX IF NOT EXISTS talent_vault_catalogue_subfolders_cat_idx
  ON public.talent_vault_catalogue_subfolders (category_slug, sort_order);

GRANT SELECT ON public.talent_vault_catalogue_subfolders TO authenticated;
GRANT ALL    ON public.talent_vault_catalogue_subfolders TO service_role;
ALTER TABLE public.talent_vault_catalogue_subfolders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read talent vault subfolders"
  ON public.talent_vault_catalogue_subfolders;
CREATE POLICY "Signed-in users can read talent vault subfolders"
  ON public.talent_vault_catalogue_subfolders FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS touch_tv_cat_categories ON public.talent_vault_catalogue_categories;
CREATE TRIGGER touch_tv_cat_categories BEFORE UPDATE ON public.talent_vault_catalogue_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS touch_tv_cat_subfolders ON public.talent_vault_catalogue_subfolders;
CREATE TRIGGER touch_tv_cat_subfolders BEFORE UPDATE ON public.talent_vault_catalogue_subfolders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Seed: the existing 19 categories, verbatim
-- ------------------------------------------------------------
INSERT INTO public.talent_vault_catalogue_categories (slug, name, icon, tone, sort_order, is_starter) VALUES
  ('personal',                 'Personal',                 'User',          'teal',   0,  true),
  ('dependents',               'Dependents',               'Baby',          'blue',   1,  false),
  ('health',                   'Health',                   'HeartPulse',    'green',  2,  true),
  ('insurance',                'Insurance',                'Shield',        'purple', 3,  true),
  ('tax',                      'Tax',                      'Landmark',      'amber',  4,  true),
  ('pets',                     'Pets',                     'PawPrint',      'red',    5,  false),
  ('assets',                   'Assets',                   'Car',           'blue',   6,  false),
  ('education',                'Education',                'GraduationCap', 'green',  7,  false),
  ('estate-planning',          'Estate Planning',          'ScrollText',    'purple', 8,  false),
  ('financial',                'Financial',                'Wallet',        'amber',  9,  true),
  ('housing',                  'Housing',                  'Home',          'teal',   10, false),
  ('legal',                    'Legal',                    'Gavel',         'red',    11, false),
  ('warranties',               'Warranties',               'BadgeCheck',    'blue',   12, false),
  ('work',                     'Work',                     'Briefcase',     'green',  13, true),
  ('vehicle',                  'Vehicle',                  'Wrench',        'purple', 14, false),
  ('utilities-subscriptions',  'Utilities & Subscriptions','Plug',          'amber',  15, false),
  ('memberships',              'Memberships',              'IdCard',        'teal',   16, false),
  ('travel',                   'Travel',                   'Plane',         'red',    17, false),
  ('receipts-purchases',       'Receipts & Purchases',     'ReceiptText',   'blue',   18, false)
ON CONFLICT (slug) DO NOTHING;

-- Flat subfolders
INSERT INTO public.talent_vault_catalogue_subfolders (category_slug, parent_name, name, kind, sort_order) VALUES
  ('personal',   NULL, 'ID',                 'folder', 0),
  ('personal',   NULL, 'Passport',           'folder', 1),
  ('personal',   NULL, 'Visa',               'folder', 2),
  ('personal',   NULL, 'Driver''s Licence',  'folder', 3),
  ('personal',   NULL, 'Birth Certificate',  'folder', 4),

  ('dependents', NULL, 'Birth Certificate',        'folder', 0),
  ('dependents', NULL, 'ID Document',              'folder', 1),
  ('dependents', NULL, 'Vaccine Cards',            'folder', 2),
  ('dependents', NULL, 'School Records',           'folder', 3),
  ('dependents', NULL, 'Bursary Records',          'folder', 4),
  ('dependents', NULL, 'Medical Aid Certificate',  'folder', 5),
  ('dependents', NULL, 'Power of Attorney',        'folder', 6),

  ('health',     NULL, 'Medical Aid Certificate',  'folder', 0),
  ('health',     NULL, 'Doctor''s Referral',       'folder', 1),
  ('health',     NULL, 'Organ Donor Proof',        'folder', 2),

  ('pets',       NULL, 'Vaccination Records',      'folder', 0),
  ('pets',       NULL, 'Microchip Registration',   'folder', 1),
  ('pets',       NULL, 'Pet Insurance',            'folder', 2),
  ('pets',       NULL, 'Veterinary Records',       'folder', 3),

  ('assets',     NULL, 'Vehicle Registration',     'folder', 0),
  ('assets',     NULL, 'Vehicle Licence Disc',     'folder', 1),
  ('assets',     NULL, 'Asset Inventory',          'folder', 2),
  ('assets',     NULL, 'Valuables Certificates',   'folder', 3),

  ('education',  NULL, 'Enrolment Letter',                 'folder', 0),
  ('education',  NULL, 'Certificate',                      'folder', 1),
  ('education',  NULL, 'Diploma',                          'folder', 2),
  ('education',  NULL, 'Bursary/Scholarship Records',      'folder', 3),
  ('education',  NULL, 'Coaching/Training Certifications', 'folder', 4),

  ('estate-planning', NULL, 'Will',                     'folder', 0),
  ('estate-planning', NULL, 'Power of Attorney',        'folder', 1),
  ('estate-planning', NULL, 'Trust Documents',          'folder', 2),
  ('estate-planning', NULL, 'Beneficiary Nominations',  'folder', 3),

  ('financial',  NULL, 'Payslip',            'folder', 0),
  ('financial',  NULL, 'Bank Statement',     'folder', 1),
  ('financial',  NULL, 'Investment Records', 'folder', 2),
  ('financial',  NULL, 'Loan Agreements',    'folder', 3),

  ('housing',    NULL, 'Lease Agreement',     'folder', 0),
  ('housing',    NULL, 'Utility Bill',        'folder', 1),
  ('housing',    NULL, 'Maintenance Records', 'folder', 2),
  ('housing',    NULL, 'Property Deeds',      'folder', 3),

  ('legal',      NULL, 'Affidavits',        'folder', 0),
  ('legal',      NULL, 'NDAs',              'folder', 1),
  ('legal',      NULL, 'Legal Agreements',  'folder', 2),

  ('warranties', NULL, 'Appliance Receipts',    'folder', 0),
  ('warranties', NULL, 'Warranty Certificates', 'folder', 1),

  ('work',       NULL, 'Employment Contract',           'folder', 0),
  ('work',       NULL, 'CV',                            'folder', 1),
  ('work',       NULL, 'Skills Development',            'folder', 2),
  ('work',       NULL, 'Career Achievements & Awards',  'folder', 3),

  ('vehicle',    NULL, 'Service History',        'folder', 0),
  ('vehicle',    NULL, 'Roadworthy Certificate', 'folder', 1),
  ('vehicle',    NULL, 'Traffic Fines',          'folder', 2),
  ('vehicle',    NULL, 'Toll Account',           'folder', 3),

  ('utilities-subscriptions', NULL, 'Electricity/Water Account',            'folder', 0),
  ('utilities-subscriptions', NULL, 'Internet/Mobile Contract',             'folder', 1),
  ('utilities-subscriptions', NULL, 'Streaming & Subscription Receipts',    'folder', 2),

  ('memberships', NULL, 'Gym Membership',                 'folder', 0),
  ('memberships', NULL, 'Professional Body/Association',  'folder', 1),
  ('memberships', NULL, 'Club Memberships',               'folder', 2),

  ('travel',     NULL, 'Flight/Travel Itineraries', 'folder', 0),
  ('travel',     NULL, 'Travel Insurance',          'folder', 1),
  ('travel',     NULL, 'Visa Applications',         'folder', 2),

  ('receipts-purchases', NULL, 'General Purchase Receipts', 'folder', 0),
  ('receipts-purchases', NULL, 'Electronics Receipts',      'folder', 1),
  ('receipts-purchases', NULL, 'Furniture Receipts',        'folder', 2)
ON CONFLICT (category_slug, parent_name, name) DO NOTHING;

-- Grouped subfolders (Insurance, Tax)
INSERT INTO public.talent_vault_catalogue_subfolders (category_slug, parent_name, name, kind, sort_order) VALUES
  ('insurance', NULL, 'Property & Vehicle', 'group', 0),
  ('insurance', NULL, 'Life & Health',      'group', 1),
  ('insurance', 'Property & Vehicle', 'Home Insurance', 'folder', 0),
  ('insurance', 'Property & Vehicle', 'Car Insurance',  'folder', 1),
  ('insurance', 'Life & Health', 'Life Insurance',                 'folder', 0),
  ('insurance', 'Life & Health', 'Critical Illness & Disability',  'folder', 1),
  ('insurance', 'Life & Health', 'Claim Documents',                'folder', 2),

  ('tax', NULL, 'Income & Earnings',     'group', 0),
  ('tax', NULL, 'Expenses & Deductions', 'group', 1),
  ('tax', NULL, 'Compliance & Filing',   'group', 2),
  ('tax', 'Income & Earnings', 'Sponsorship & Endorsement Income', 'folder', 0),
  ('tax', 'Income & Earnings', 'Prize Money & Appearance Fees',    'folder', 1),
  ('tax', 'Income & Earnings', 'Royalties & Image Rights',         'folder', 2),
  ('tax', 'Expenses & Deductions', 'Expense Receipts',                    'folder', 0),
  ('tax', 'Expenses & Deductions', 'Travel Logbook',                      'folder', 1),
  ('tax', 'Expenses & Deductions', 'Training & Equipment Expenses',       'folder', 2),
  ('tax', 'Expenses & Deductions', 'Agent/Manager Commission Invoices',   'folder', 3),
  ('tax', 'Compliance & Filing', 'Provisional Tax (IRP6)',        'folder', 0),
  ('tax', 'Compliance & Filing', 'Income Tax Return (ITR12)',     'folder', 1),
  ('tax', 'Compliance & Filing', 'Tax Clearance Certificate',     'folder', 2),
  ('tax', 'Compliance & Filing', 'Foreign Income & DTA Records',  'folder', 3),
  ('tax', 'Compliance & Filing', 'SARS Correspondence',           'folder', 4)
ON CONFLICT (category_slug, parent_name, name) DO NOTHING;

-- ------------------------------------------------------------
-- Seeding routines now read the catalogue
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_talent_default_folders(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  top RECORD;
  parent_id_v uuid;
  grp RECORD;
  group_id uuid;
  leaf RECORD;
  other_order int;
  has_groups boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  FOR top IN
    SELECT slug, name, icon, tone, sort_order
      FROM public.talent_vault_catalogue_categories
     ORDER BY sort_order
  LOOP
    SELECT id INTO parent_id_v FROM public.talent_private_folders
      WHERE user_id = _user_id AND parent_id IS NULL AND name = top.name LIMIT 1;
    IF parent_id_v IS NULL THEN
      INSERT INTO public.talent_private_folders (user_id, name, icon, tone, sort_order)
      VALUES (_user_id, top.name, top.icon, top.tone, top.sort_order)
      RETURNING id INTO parent_id_v;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.talent_vault_catalogue_subfolders
       WHERE category_slug = top.slug AND kind = 'group'
    ) INTO has_groups;

    IF has_groups THEN
      FOR grp IN
        SELECT name, sort_order FROM public.talent_vault_catalogue_subfolders
         WHERE category_slug = top.slug AND kind = 'group' AND parent_name IS NULL
         ORDER BY sort_order
      LOOP
        SELECT id INTO group_id FROM public.talent_private_folders
          WHERE user_id = _user_id AND parent_id = parent_id_v AND name = grp.name LIMIT 1;
        IF group_id IS NULL THEN
          INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
          VALUES (_user_id, parent_id_v, grp.name, grp.sort_order)
          RETURNING id INTO group_id;
        END IF;

        FOR leaf IN
          SELECT name, sort_order FROM public.talent_vault_catalogue_subfolders
           WHERE category_slug = top.slug AND kind = 'folder' AND parent_name = grp.name
           ORDER BY sort_order
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.talent_private_folders
             WHERE user_id = _user_id AND parent_id = group_id AND name = leaf.name
          ) THEN
            INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
            VALUES (_user_id, group_id, leaf.name, leaf.sort_order);
          END IF;
        END LOOP;
      END LOOP;
      other_order := 99;
    ELSE
      other_order := 0;
      FOR leaf IN
        SELECT name, sort_order FROM public.talent_vault_catalogue_subfolders
         WHERE category_slug = top.slug AND kind = 'folder' AND parent_name IS NULL
         ORDER BY sort_order
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.talent_private_folders
           WHERE user_id = _user_id AND parent_id = parent_id_v AND name = leaf.name
        ) THEN
          INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
          VALUES (_user_id, parent_id_v, leaf.name, leaf.sort_order);
        END IF;
        other_order := leaf.sort_order + 1;
      END LOOP;
    END IF;

    -- Catch-all "Other" subfolder for every top-level category
    IF NOT EXISTS (
      SELECT 1 FROM public.talent_private_folders
       WHERE user_id = _user_id AND parent_id = parent_id_v AND name = 'Other'
    ) THEN
      INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
      VALUES (_user_id, parent_id_v, 'Other', other_order);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_talent_private_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.seed_talent_default_folders(NEW.user_id);
  DELETE FROM public.talent_private_folders
   WHERE user_id = NEW.user_id
     AND parent_id IS NULL
     AND name NOT IN (
       SELECT name FROM public.talent_vault_catalogue_categories WHERE is_starter
     );
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- Logged, reversible spelling correction on existing folders
-- ------------------------------------------------------------
DO $$
DECLARE
  batch uuid := '8f3a1c62-5e4b-4d21-9a77-2c9b6f0d41ae';
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, name FROM public.talent_private_folders
     WHERE name IN ('Driver''s License', 'Vehicle License Disk')
  LOOP
    INSERT INTO public.folder_rename_migration_log
      (batch_id, batch_label, source_table, row_id, column_name, old_value, new_value, row_snapshot)
    VALUES (
      batch,
      'talent_vault_catalogue_uk_spelling',
      'talent_private_folders',
      r.id,
      'name',
      r.name,
      CASE r.name WHEN 'Driver''s License' THEN 'Driver''s Licence'
                  ELSE 'Vehicle Licence Disc' END,
      to_jsonb((SELECT t FROM public.talent_private_folders t WHERE t.id = r.id))
    );

    UPDATE public.talent_private_folders
       SET name = CASE r.name WHEN 'Driver''s License' THEN 'Driver''s Licence'
                              ELSE 'Vehicle Licence Disc' END
     WHERE id = r.id;
  END LOOP;
END $$;