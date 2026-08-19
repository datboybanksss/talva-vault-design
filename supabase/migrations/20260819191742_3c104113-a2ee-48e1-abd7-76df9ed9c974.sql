-- 1. Platform catalogue -------------------------------------------------
CREATE TABLE public.folder_catalogue_categories (
  slug text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  restricted boolean NOT NULL DEFAULT false,
  recommended boolean NOT NULL DEFAULT false,
  ai_filing_allowed boolean NOT NULL DEFAULT true,
  default_validity_rule text NOT NULL DEFAULT 'No expiry unless document indicates one',
  can_untick boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.folder_catalogue_categories TO authenticated;
GRANT ALL ON public.folder_catalogue_categories TO service_role;
ALTER TABLE public.folder_catalogue_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalogue readable by signed-in users"
  ON public.folder_catalogue_categories FOR SELECT TO authenticated USING (true);

CREATE TABLE public.folder_catalogue_subfolders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug text NOT NULL REFERENCES public.folder_catalogue_categories(slug) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'default' CHECK (kind IN ('default','optional')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_slug, name)
);
GRANT SELECT ON public.folder_catalogue_subfolders TO authenticated;
GRANT ALL ON public.folder_catalogue_subfolders TO service_role;
ALTER TABLE public.folder_catalogue_subfolders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subfolder catalogue readable by signed-in users"
  ON public.folder_catalogue_subfolders FOR SELECT TO authenticated USING (true);

CREATE TABLE public.folder_type_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_type text NOT NULL,
  category_slug text NOT NULL REFERENCES public.folder_catalogue_categories(slug) ON DELETE CASCADE,
  subfolder_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talent_type, category_slug, subfolder_name)
);
GRANT SELECT ON public.folder_type_template_items TO authenticated;
GRANT ALL ON public.folder_type_template_items TO service_role;
ALTER TABLE public.folder_type_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Talent type templates readable by signed-in users"
  ON public.folder_type_template_items FOR SELECT TO authenticated USING (true);

-- 2. Per-agency overlay ---------------------------------------------------
CREATE TABLE public.agency_folder_subfolder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  category_slug text NOT NULL REFERENCES public.folder_catalogue_categories(slug) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'default' CHECK (kind IN ('default','optional')),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  retention_years integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, category_slug, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_folder_subfolder_settings TO authenticated;
GRANT ALL ON public.agency_folder_subfolder_settings TO service_role;
ALTER TABLE public.agency_folder_subfolder_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency members read subfolder settings"
  ON public.agency_folder_subfolder_settings FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Agency owners insert subfolder settings"
  ON public.agency_folder_subfolder_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));
CREATE POLICY "Agency owners update subfolder settings"
  ON public.agency_folder_subfolder_settings FOR UPDATE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'));
CREATE POLICY "Agency owners delete subfolder settings"
  ON public.agency_folder_subfolder_settings FOR DELETE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'));
CREATE TRIGGER agency_folder_subfolder_settings_touch
  BEFORE UPDATE ON public.agency_folder_subfolder_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Talent folder hierarchy ---------------------------------------------
ALTER TABLE public.agency_talent_folders
  ADD COLUMN IF NOT EXISTS parent_folder_id uuid REFERENCES public.agency_talent_folders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category_slug text REFERENCES public.folder_catalogue_categories(slug),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.agency_talent_folders
  DROP CONSTRAINT IF EXISTS agency_talent_folders_talent_link_id_folder_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS agency_talent_folders_unique_name
  ON public.agency_talent_folders (
    talent_link_id,
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(folder_name)
  );
CREATE INDEX IF NOT EXISTS agency_talent_folders_parent_idx
  ON public.agency_talent_folders (parent_folder_id);

-- 4. Restricted-category access ------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_talent_folder(
  _user_id uuid, _talent_link_id uuid, _restricted boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_talent_links l
    WHERE l.id = _talent_link_id
      AND (
        l.talent_user_id = _user_id
        OR public.has_role(_user_id, 'admin')
        OR (
          public.is_agency_member(_user_id, l.agency_id)
          AND (
            COALESCE(_restricted, false) = false
            OR public.has_agency_role(_user_id, l.agency_id, 'owner')
            OR l.manager_user_id = _user_id
          )
        )
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_talent_folder(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_talent_folder(uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_restricted_folder_name(_agency_id uuid, _folder_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT c.restricted FROM public.folder_catalogue_categories c
    WHERE c.name = _folder_name
  ), (
    SELECT c.restricted
    FROM public.agency_talent_folders f
    JOIN public.folder_catalogue_categories c ON c.slug = f.category_slug
    WHERE f.agency_id = _agency_id AND f.folder_name = _folder_name
    LIMIT 1
  ), false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_restricted_folder_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_restricted_folder_name(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Agency members read own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members read own agency talent folders"
  ON public.agency_talent_folders FOR SELECT TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    AND public.can_access_talent_folder(auth.uid(), talent_link_id, restricted)
  );
DROP POLICY IF EXISTS "Agency members update own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members update own agency talent folders"
  ON public.agency_talent_folders FOR UPDATE TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    AND public.can_access_talent_folder(auth.uid(), talent_link_id, restricted)
  );
DROP POLICY IF EXISTS "Agency members delete own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members delete own agency talent folders"
  ON public.agency_talent_folders FOR DELETE TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    AND public.can_access_talent_folder(auth.uid(), talent_link_id, restricted)
  );

DROP POLICY IF EXISTS "Agency or talent read shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency or talent read shared docs"
  ON public.talent_shared_documents FOR SELECT TO authenticated
  USING (
    (
      public.is_agency_member(auth.uid(), agency_id)
      AND (
        talent_link_id IS NULL
        OR public.can_access_talent_folder(
             auth.uid(), talent_link_id,
             public.is_restricted_folder_name(agency_id, folder))
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.agency_talent_links l
      WHERE l.id = talent_shared_documents.talent_link_id
        AND l.talent_user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Agency updates shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency updates shared docs"
  ON public.talent_shared_documents FOR UPDATE TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    AND (
      talent_link_id IS NULL
      OR public.can_access_talent_folder(
           auth.uid(), talent_link_id,
           public.is_restricted_folder_name(agency_id, folder))
    )
  );
DROP POLICY IF EXISTS "Agency deletes shared docs" ON public.talent_shared_documents;
CREATE POLICY "Agency deletes shared docs"
  ON public.talent_shared_documents FOR DELETE TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    AND (
      talent_link_id IS NULL
      OR public.can_access_talent_folder(
           auth.uid(), talent_link_id,
           public.is_restricted_folder_name(agency_id, folder))
    )
  );

-- 5. Catalogue seed -------------------------------------------------------
INSERT INTO public.folder_catalogue_categories
  (slug, name, sort_order, restricted, recommended, ai_filing_allowed, default_validity_rule, can_untick)
VALUES
  ('identity_personal','Identity & Personal',0,false,true,true,'Based on document expiry',false),
  ('contracts_agreements','Contracts & Agreements',1,false,true,true,'Based on document expiry',false),
  ('banking_tax_financial','Banking, Tax & Financial',2,false,true,true,'5 years',true),
  ('travel_visas','Travel & Visas',3,false,true,true,'Based on document expiry',true),
  ('medical_fitness_insurance','Medical, Fitness & Insurance',4,true,false,true,'1 year',true),
  ('career_professional','Career & Professional Records',5,false,false,true,'No expiry unless document indicates one',true),
  ('brand_sponsorship_media','Brand, Sponsorship & Media',6,false,false,true,'Based on document expiry',true),
  ('bookings_events','Bookings, Events & Appearances',7,false,false,true,'3 years',true),
  ('rights_licences_compliance','Rights, Licences & Compliance',8,false,false,true,'Based on document expiry',true),
  ('other_documents','Other Documents',9,false,false,false,'No expiry unless document indicates one',true)
ON CONFLICT (slug) DO NOTHING;

WITH data(slug, kind, names) AS (VALUES
  ('identity_personal','default', ARRAY['ID / Passport','Proof of Address','Driver''s Licence','Personal Details','Emergency Contacts']),
  ('identity_personal','optional', ARRAY['Birth Certificate','Residency Documents','Name Change Documents','Other Personal Documents']),
  ('contracts_agreements','default', ARRAY['Agency / Representation Agreement','Employment / Club Contracts','Performance / Appearance Agreements','Sponsorship / Endorsement Agreements','NDAs & Confidentiality','Amendments / Addendums']),
  ('contracts_agreements','optional', ARRAY['Licensing Agreements','Supplier / Third-Party Agreements','Historical / Expired Agreements']),
  ('banking_tax_financial','default', ARRAY['Banking Details','Bank Confirmation','Tax Documents','Invoices','Payment Confirmations']),
  ('banking_tax_financial','optional', ARRAY['VAT Documents','Royalty Statements','Earnings Statements','Financial Statements','Withholding Tax Documents']),
  ('travel_visas','default', ARRAY['Passport','Visas','Work Permits','Travel Authorisations','Travel Itineraries']),
  ('travel_visas','optional', ARRAY['Invitation Letters','Flights','Accommodation','Travel Insurance','Frequent Traveller Documents']),
  ('medical_fitness_insurance','default', ARRAY['Medical Certificates','Medical Clearance','Fitness Assessments','Insurance']),
  ('medical_fitness_insurance','optional', ARRAY['Injury Reports','Rehabilitation Documents','Medical Aid','Personal Accident Insurance','Travel Insurance']),
  ('career_professional','default', ARRAY['Talent Profile / CV','Biography','Qualifications','Certifications','Awards & Achievements']),
  ('career_professional','optional', ARRAY['Career History','Memberships','Registrations','Rankings','Statistics','Performance Reports']),
  ('brand_sponsorship_media','default', ARRAY['Media Kit','Headshots & Approved Images','Sponsorships','Campaign Briefs','Campaign Deliverables']),
  ('brand_sponsorship_media','optional', ARRAY['Brand Guidelines','Press Releases','Media Coverage','Interviews','Social Media Campaigns','Promotional Material']),
  ('bookings_events','default', ARRAY['Booking Confirmations','Event Agreements','Schedules / Call Sheets','Riders','Completed Events']),
  ('bookings_events','optional', ARRAY['Appearance Requirements','Hospitality Rider','Technical Rider','Event Travel','Event Deliverables','Event Correspondence']),
  ('rights_licences_compliance','default', ARRAY['Image & Likeness Rights','Usage Rights','Release & Consent Forms','Licences','Compliance Documents']),
  ('rights_licences_compliance','optional', ARRAY['Copyright','Trademarks','Music Rights','Content Licensing','Governing Body Documents','Anti-Doping Documents','Legal Correspondence']),
  ('other_documents','default', ARRAY['General','Correspondence','To Be Classified','Archive'])
)
INSERT INTO public.folder_catalogue_subfolders (category_slug, name, kind, sort_order)
SELECT d.slug, n.name, d.kind,
       (CASE WHEN d.kind = 'optional' THEN 100 ELSE 0 END) + (n.ord - 1)::int
FROM data d, unnest(d.names) WITH ORDINALITY AS n(name, ord)
ON CONFLICT (category_slug, name) DO NOTHING;

WITH t(talent_type, slug, names) AS (VALUES
  ('Athlete','career_professional', ARRAY['Federation / Association Registration','Club / Team Records','Competition Records','Rankings & Statistics','Performance Reports','Awards & Achievements']),
  ('Athlete','medical_fitness_insurance', ARRAY['Medical Clearance','Fitness Assessments','Injury Reports','Rehabilitation','Return-to-Play Clearance']),
  ('Athlete','rights_licences_compliance', ARRAY['Governing Body Documents','Player Registration','Anti-Doping Documents','Competition Eligibility','Transfer / Clearance Documents']),
  ('Musician / Singer','career_professional', ARRAY['Discography','Releases','Performance History','Awards','Collaborations']),
  ('Musician / Singer','rights_licences_compliance', ARRAY['Music Rights','Publishing Rights','Recording Agreements','Master Rights','Copyright','Licensing Agreements','Royalty Agreements']),
  ('Musician / Singer','bookings_events', ARRAY['Performance Agreements','Technical Rider','Hospitality Rider','Set Lists','Tour Documents']),
  ('Musician / Singer','brand_sponsorship_media', ARRAY['Press Kit','Artist Bio','Promotional Images','Album / Single Artwork','Press Coverage']),
  ('Actor / Performer','career_professional', ARRAY['Filmography','Theatre / Production Credits','Showreel','Audition Material','Awards']),
  ('Actor / Performer','bookings_events', ARRAY['Casting Agreements','Production Contracts','Call Sheets','Shoot Schedules','Appearance Agreements']),
  ('Actor / Performer','rights_licences_compliance', ARRAY['Performance Release','Image Rights','Usage Rights','Production Releases']),
  ('Actor / Performer','brand_sponsorship_media', ARRAY['Headshots','Acting Profile','Showreel','Press Kit']),
  ('Influencer / Content Creator','brand_sponsorship_media', ARRAY['Media Kit','Rate Card','Brand Campaigns','Campaign Briefs','Content Deliverables','Campaign Reports','Audience / Analytics Reports']),
  ('Influencer / Content Creator','contracts_agreements', ARRAY['Brand Agreements','Influencer Agreements','Ambassador Agreements','Affiliate Agreements']),
  ('Influencer / Content Creator','rights_licences_compliance', ARRAY['Content Usage Rights','Image Rights','Content Licensing','Releases']),
  ('Influencer / Content Creator','banking_tax_financial', ARRAY['Campaign Invoices','Payment Confirmations','Affiliate Statements']),
  ('Presenter / Public Figure','career_professional', ARRAY['Presenter Profile','Career History','Showreel','Speaking Profile']),
  ('Presenter / Public Figure','bookings_events', ARRAY['Speaking Engagements','MC / Hosting Agreements','Appearance Agreements','Event Briefs','Call Sheets']),
  ('Presenter / Public Figure','brand_sponsorship_media', ARRAY['Media Kit','Press Images','Interviews','Brand Campaigns','Speaking Material'])
)
INSERT INTO public.folder_type_template_items (talent_type, category_slug, subfolder_name, sort_order)
SELECT t.talent_type, t.slug, n.name, (n.ord - 1)::int
FROM t, unnest(t.names) WITH ORDINALITY AS n(name, ord)
ON CONFLICT (talent_type, category_slug, subfolder_name) DO NOTHING;

-- 6. Backfill category_slug / restricted on existing talent folders --------
UPDATE public.agency_talent_folders f
   SET category_slug = c.slug,
       restricted = c.restricted
  FROM public.folder_catalogue_categories c
 WHERE f.parent_folder_id IS NULL
   AND f.category_slug IS NULL
   AND c.name = f.folder_name;

-- 7. Provisioning ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_talent_folders(
  _agency_id uuid,
  _talent_link_id uuid,
  _category_names text[],
  _talent_type text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cat RECORD;
  sub RECORD;
  parent_id uuid;
  created int := 0;
  idx int;
BEGIN
  FOR cat IN
    SELECT c.* FROM public.folder_catalogue_categories c
    WHERE _category_names IS NULL OR c.name = ANY(_category_names)
    ORDER BY c.sort_order
  LOOP
    SELECT id INTO parent_id FROM public.agency_talent_folders
     WHERE talent_link_id = _talent_link_id
       AND parent_folder_id IS NULL
       AND lower(folder_name) = lower(cat.name)
     LIMIT 1;

    IF parent_id IS NULL THEN
      INSERT INTO public.agency_talent_folders
        (agency_id, talent_link_id, folder_name, sort_order, category_slug, restricted, source)
      VALUES (_agency_id, _talent_link_id, cat.name, cat.sort_order, cat.slug, cat.restricted, 'default')
      RETURNING id INTO parent_id;
      created := created + 1;
    ELSE
      UPDATE public.agency_talent_folders
         SET category_slug = cat.slug, restricted = cat.restricted
       WHERE id = parent_id;
    END IF;

    idx := 0;
    FOR sub IN
      -- category defaults, overlaid by the agency's own settings
      SELECT COALESCE(a.name, s.name) AS name,
             COALESCE(a.sort_order, s.sort_order) AS sort_order,
             'default'::text AS source
        FROM public.folder_catalogue_subfolders s
        LEFT JOIN public.agency_folder_subfolder_settings a
               ON a.agency_id = _agency_id
              AND a.category_slug = s.category_slug
              AND a.name = s.name
       WHERE s.category_slug = cat.slug
         AND s.kind = 'default'
         AND COALESCE(a.enabled, true)
      UNION
      -- agency-added subfolders for this category
      SELECT a.name, a.sort_order, 'default'::text
        FROM public.agency_folder_subfolder_settings a
       WHERE a.agency_id = _agency_id
         AND a.category_slug = cat.slug
         AND a.kind = 'default'
         AND a.enabled
      UNION
      -- talent-type additions
      SELECT ti.subfolder_name, 200 + ti.sort_order, 'talent_type'::text
        FROM public.folder_type_template_items ti
       WHERE ti.category_slug = cat.slug
         AND _talent_type IS NOT NULL
         AND ti.talent_type = _talent_type
      ORDER BY 2, 1
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.agency_talent_folders
         WHERE talent_link_id = _talent_link_id
           AND parent_folder_id = parent_id
           AND lower(folder_name) = lower(sub.name)
      ) THEN
        INSERT INTO public.agency_talent_folders
          (agency_id, talent_link_id, parent_folder_id, folder_name, sort_order,
           category_slug, restricted, source)
        VALUES (_agency_id, _talent_link_id, parent_id, sub.name, idx,
                cat.slug, cat.restricted, sub.source);
        created := created + 1;
      END IF;
      idx := idx + 1;
    END LOOP;
  END LOOP;

  RETURN created;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.provision_talent_folders(uuid, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_talent_folders(uuid, uuid, text[], text) TO authenticated, service_role;

-- Flag subfolders that a talent type no longer calls for, without deleting
CREATE OR REPLACE FUNCTION public.reconcile_talent_type_folders(
  _talent_link_id uuid, _new_talent_type text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE flagged int := 0; ag uuid;
BEGIN
  SELECT agency_id INTO ag FROM public.agency_talent_links WHERE id = _talent_link_id;
  IF ag IS NULL THEN RETURN 0; END IF;

  PERFORM public.provision_talent_folders(
    ag, _talent_link_id,
    (SELECT array_agg(folder_name) FROM public.agency_talent_folders
      WHERE talent_link_id = _talent_link_id AND parent_folder_id IS NULL),
    _new_talent_type);

  UPDATE public.agency_talent_folders f
     SET needs_review = true
   WHERE f.talent_link_id = _talent_link_id
     AND f.parent_folder_id IS NOT NULL
     AND f.source = 'talent_type'
     AND NOT EXISTS (
       SELECT 1 FROM public.folder_type_template_items ti
        WHERE ti.talent_type = _new_talent_type
          AND ti.category_slug = f.category_slug
          AND lower(ti.subfolder_name) = lower(f.folder_name)
     );
  GET DIAGNOSTICS flagged = ROW_COUNT;

  UPDATE public.agency_talent_folders f
     SET needs_review = false
   WHERE f.talent_link_id = _talent_link_id
     AND f.source = 'talent_type'
     AND EXISTS (
       SELECT 1 FROM public.folder_type_template_items ti
        WHERE ti.talent_type = _new_talent_type
          AND ti.category_slug = f.category_slug
          AND lower(ti.subfolder_name) = lower(f.folder_name)
     );

  RETURN flagged;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reconcile_talent_type_folders(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_talent_type_folders(uuid, text) TO authenticated, service_role;

-- 8. Invitation acceptance now provisions the full tree -------------------
CREATE OR REPLACE FUNCTION public.accept_talent_invitation(_invitation_id uuid, _user_id uuid, _email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  new_link_id uuid;
  new_profile_id uuid;
  selected text[];
BEGIN
  SELECT * INTO inv FROM public.talent_invitations
   WHERE id = _invitation_id
     AND status = 'pending'
     AND expires_at > now();
  IF inv.id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO new_profile_id FROM public.talent_profiles
    WHERE user_id = _user_id LIMIT 1;
  IF new_profile_id IS NULL THEN
    INSERT INTO public.talent_profiles (user_id, agency_id, full_name, email)
    VALUES (_user_id, inv.agency_id, COALESCE(inv.talent_name, _email), _email)
    RETURNING id INTO new_profile_id;
  END IF;

  INSERT INTO public.agency_talent_links
    (agency_id, talent_user_id, talent_profile_id, talent_invitation_id,
     display_name, status, manager_user_id, talent_type)
  VALUES
    (inv.agency_id, _user_id, new_profile_id, inv.id,
     COALESCE(inv.talent_name, _email), 'active', inv.manager_user_id, inv.talent_type)
  RETURNING id INTO new_link_id;

  SELECT array_agg(x->>'name')
    INTO selected
    FROM jsonb_array_elements(COALESCE(inv.folder_selection, '[]'::jsonb)) x;

  PERFORM public.provision_talent_folders(
    inv.agency_id, new_link_id,
    CASE WHEN selected IS NULL OR array_length(selected, 1) IS NULL THEN NULL ELSE selected END,
    inv.talent_type);

  UPDATE public.talent_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = inv.id;

  RETURN new_link_id;
END;
$function$;