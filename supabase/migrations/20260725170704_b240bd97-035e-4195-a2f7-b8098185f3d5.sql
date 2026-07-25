CREATE OR REPLACE FUNCTION public.seed_talent_default_folders(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  top RECORD;
  parent_id_v uuid;
  grp RECORD;
  group_id uuid;
  child text;
  i int;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  FOR top IN
    SELECT * FROM (VALUES
      ('Personal',   'User',       'teal',   0),
      ('Dependents', 'Baby',       'blue',   1),
      ('Health',     'HeartPulse', 'green',  2),
      ('Insurance',  'Shield',     'purple', 3),
      ('Tax',        'Landmark',   'amber',  4),
      ('Pets',       'PawPrint',   'red',    5)
    ) AS f(name, icon, tone, sort_order)
  LOOP
    SELECT id INTO parent_id_v FROM public.talent_private_folders
      WHERE user_id = _user_id AND parent_id IS NULL AND name = top.name LIMIT 1;
    IF parent_id_v IS NULL THEN
      INSERT INTO public.talent_private_folders (user_id, name, icon, tone, sort_order)
      VALUES (_user_id, top.name, top.icon, top.tone, top.sort_order)
      RETURNING id INTO parent_id_v;
    END IF;

    IF top.name IN ('Insurance', 'Tax') THEN
      FOR grp IN
        SELECT * FROM (VALUES
          ('Insurance', 'Property & Vehicle',    0, ARRAY['Home Insurance','Car Insurance']),
          ('Insurance', 'Life & Health',         1, ARRAY['Life Insurance','Critical Illness & Disability','Claim Documents']),
          ('Tax',       'Income & Earnings',     0, ARRAY['Sponsorship & Endorsement Income','Prize Money & Appearance Fees','Royalties & Image Rights']),
          ('Tax',       'Expenses & Deductions', 1, ARRAY['Expense Receipts','Travel Logbook','Training & Equipment Expenses','Agent/Manager Commission Invoices']),
          ('Tax',       'Compliance & Filing',   2, ARRAY['Provisional Tax (IRP6)','Income Tax Return (ITR12)','Tax Clearance Certificate','Foreign Income & DTA Records','SARS Correspondence'])
        ) AS g(top_name, group_name, sort_order, children)
        WHERE g.top_name = top.name
      LOOP
        SELECT id INTO group_id FROM public.talent_private_folders
          WHERE user_id = _user_id AND parent_id = parent_id_v AND name = grp.group_name LIMIT 1;
        IF group_id IS NULL THEN
          INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
          VALUES (_user_id, parent_id_v, grp.group_name, grp.sort_order)
          RETURNING id INTO group_id;
        END IF;

        i := 0;
        FOREACH child IN ARRAY grp.children LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.talent_private_folders
            WHERE user_id = _user_id AND parent_id = group_id AND name = child
          ) THEN
            INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
            VALUES (_user_id, group_id, child, i);
          END IF;
          i := i + 1;
        END LOOP;
      END LOOP;
    ELSE
      i := 0;
      FOREACH child IN ARRAY (
        CASE top.name
          WHEN 'Personal'   THEN ARRAY['ID','Passport','Visa','Driver''s License','Birth Certificate']
          WHEN 'Dependents' THEN ARRAY['Birth Certificate','Vaccine Cards','School Records','Bursary Records']
          WHEN 'Health'     THEN ARRAY['Medical Aid Certificate','Doctor''s Referral','Organ Donor Proof']
          WHEN 'Pets'       THEN ARRAY['Vaccination Records','Microchip Registration','Pet Insurance','Veterinary Records']
        END
      ) LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.talent_private_folders
          WHERE user_id = _user_id AND parent_id = parent_id_v AND name = child
        ) THEN
          INSERT INTO public.talent_private_folders (user_id, parent_id, name, sort_order)
          VALUES (_user_id, parent_id_v, child, i);
        END IF;
        i := i + 1;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_talent_private_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.seed_talent_default_folders(NEW.user_id);
  RETURN NEW;
END;
$$;

DO $$
DECLARE u uuid;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM public.talent_private_folders WHERE user_id IS NOT NULL
    UNION
    SELECT DISTINCT user_id FROM public.talent_profiles WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.seed_talent_default_folders(u);
  END LOOP;
END $$;