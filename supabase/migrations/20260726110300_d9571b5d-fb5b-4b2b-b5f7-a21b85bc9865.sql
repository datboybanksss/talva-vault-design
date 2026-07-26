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
  child text;
  i int;
  other_order int;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  FOR top IN
    SELECT * FROM (VALUES
      ('Personal',        'User',        'teal',   0),
      ('Dependents',      'Baby',        'blue',   1),
      ('Health',          'HeartPulse',  'green',  2),
      ('Insurance',       'Shield',      'purple', 3),
      ('Tax',             'Landmark',    'amber',  4),
      ('Pets',            'PawPrint',    'red',    5),
      ('Assets',          'Car',         'blue',   6),
      ('Education',       'GraduationCap','green', 7),
      ('Estate Planning', 'ScrollText',  'purple', 8),
      ('Financial',       'Wallet',      'amber',  9),
      ('Housing',         'Home',        'teal',   10),
      ('Legal',           'Gavel',       'red',    11),
      ('Warranties',      'BadgeCheck',  'blue',   12),
      ('Work',            'Briefcase',   'green',  13),
      ('Vehicle',         'Wrench',      'purple', 14),
      ('Utilities & Subscriptions', 'Plug', 'amber', 15),
      ('Memberships',     'IdCard',      'teal',   16),
      ('Travel',          'Plane',       'red',    17),
      ('Receipts & Purchases', 'ReceiptText', 'blue', 18)
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
      other_order := 99;
    ELSE
      i := 0;
      FOREACH child IN ARRAY (
        CASE top.name
          WHEN 'Personal'        THEN ARRAY['ID','Passport','Visa','Driver''s License','Birth Certificate']
          WHEN 'Dependents'      THEN ARRAY['Birth Certificate','ID Document','Vaccine Cards','School Records','Bursary Records','Medical Aid Certificate','Power of Attorney']
          WHEN 'Health'          THEN ARRAY['Medical Aid Certificate','Doctor''s Referral','Organ Donor Proof']
          WHEN 'Pets'            THEN ARRAY['Vaccination Records','Microchip Registration','Pet Insurance','Veterinary Records']
          WHEN 'Assets'          THEN ARRAY['Vehicle Registration','Vehicle License Disk','Asset Inventory','Valuables Certificates']
          WHEN 'Education'       THEN ARRAY['Enrolment Letter','Certificate','Diploma','Bursary/Scholarship Records','Coaching/Training Certifications']
          WHEN 'Estate Planning' THEN ARRAY['Will','Power of Attorney','Trust Documents','Beneficiary Nominations']
          WHEN 'Financial'       THEN ARRAY['Payslip','Bank Statement','Investment Records','Loan Agreements']
          WHEN 'Housing'         THEN ARRAY['Lease Agreement','Utility Bill','Maintenance Records','Property Deeds']
          WHEN 'Legal'           THEN ARRAY['Affidavits','NDAs','Legal Agreements']
          WHEN 'Warranties'      THEN ARRAY['Appliance Receipts','Warranty Certificates']
          WHEN 'Work'            THEN ARRAY['Employment Contract','CV','Skills Development','Career Achievements & Awards']
          WHEN 'Vehicle'         THEN ARRAY['Service History','Roadworthy Certificate','Traffic Fines','Toll Account']
          WHEN 'Utilities & Subscriptions' THEN ARRAY['Electricity/Water Account','Internet/Mobile Contract','Streaming & Subscription Receipts']
          WHEN 'Memberships'     THEN ARRAY['Gym Membership','Professional Body/Association','Club Memberships']
          WHEN 'Travel'          THEN ARRAY['Flight/Travel Itineraries','Travel Insurance','Visa Applications']
          WHEN 'Receipts & Purchases' THEN ARRAY['General Purchase Receipts','Electronics Receipts','Furniture Receipts']
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
      other_order := i;
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