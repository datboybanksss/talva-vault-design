
-- 1) Persist folder choice on the invitation
ALTER TABLE public.talent_invitations
  ADD COLUMN IF NOT EXISTS folder_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS folder_selection jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.talent_invitations
  DROP CONSTRAINT IF EXISTS talent_invitations_folder_mode_check;
ALTER TABLE public.talent_invitations
  ADD CONSTRAINT talent_invitations_folder_mode_check
  CHECK (folder_mode IN ('standard','custom'));

-- 2) agency_talent_folders — real folder records per talent
CREATE TABLE IF NOT EXISTS public.agency_talent_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_link_id uuid NOT NULL REFERENCES public.agency_talent_links(id) ON DELETE CASCADE,
  folder_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  retention_years integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talent_link_id, folder_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_talent_folders TO authenticated;
GRANT ALL ON public.agency_talent_folders TO service_role;

ALTER TABLE public.agency_talent_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members read own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members read own agency talent folders"
  ON public.agency_talent_folders FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Agency members insert own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members insert own agency talent folders"
  ON public.agency_talent_folders FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Agency members update own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members update own agency talent folders"
  ON public.agency_talent_folders FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Agency members delete own agency talent folders" ON public.agency_talent_folders;
CREATE POLICY "Agency members delete own agency talent folders"
  ON public.agency_talent_folders FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE INDEX IF NOT EXISTS idx_agency_talent_folders_link ON public.agency_talent_folders(talent_link_id);
CREATE INDEX IF NOT EXISTS idx_agency_talent_folders_agency ON public.agency_talent_folders(agency_id);

DROP TRIGGER IF EXISTS trg_agency_talent_folders_touch ON public.agency_talent_folders;
CREATE TRIGGER trg_agency_talent_folders_touch
  BEFORE UPDATE ON public.agency_talent_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Acceptance helper: create profile + link + provision folders
CREATE OR REPLACE FUNCTION public.accept_talent_invitation(
  _invitation_id uuid,
  _user_id uuid,
  _email text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  new_link_id uuid;
  new_profile_id uuid;
  folder jsonb;
  idx int := 0;
BEGIN
  SELECT * INTO inv FROM public.talent_invitations
   WHERE id = _invitation_id
     AND status = 'pending'
     AND expires_at > now();
  IF inv.id IS NULL THEN RETURN NULL; END IF;

  -- upsert talent_profile
  SELECT id INTO new_profile_id FROM public.talent_profiles
    WHERE user_id = _user_id LIMIT 1;
  IF new_profile_id IS NULL THEN
    INSERT INTO public.talent_profiles (user_id, agency_id, full_name, email)
    VALUES (_user_id, inv.agency_id, COALESCE(inv.talent_name, _email), _email)
    RETURNING id INTO new_profile_id;
  END IF;

  -- create link
  INSERT INTO public.agency_talent_links
    (agency_id, talent_user_id, talent_profile_id, talent_invitation_id,
     display_name, status)
  VALUES
    (inv.agency_id, _user_id, new_profile_id, inv.id,
     COALESCE(inv.talent_name, _email), 'active')
  RETURNING id INTO new_link_id;

  -- provision folders from persisted selection
  FOR folder IN SELECT * FROM jsonb_array_elements(inv.folder_selection)
  LOOP
    INSERT INTO public.agency_talent_folders
      (agency_id, talent_link_id, folder_name, sort_order, retention_years)
    VALUES (
      inv.agency_id, new_link_id,
      folder->>'name',
      COALESCE(NULLIF(folder->>'sort_order','')::int, idx),
      NULLIF(folder->>'retention_years','')::int
    )
    ON CONFLICT (talent_link_id, folder_name) DO NOTHING;
    idx := idx + 1;
  END LOOP;

  UPDATE public.talent_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = inv.id;

  RETURN new_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_talent_invitation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 4) Extend handle_new_user to trigger talent invitation acceptance
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  ag_inv RECORD;
  tal_inv RECORD;
  new_agency_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'israel@npiconsulting.co.za' THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', true, 'edit')
    ON CONFLICT (user_id, role) DO UPDATE
      SET is_main_admin = true, permission_level = 'edit';
  END IF;

  -- Admin invitations
  SELECT * INTO inv FROM public.admin_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', false, inv.permission_level)
    ON CONFLICT (user_id, role) DO UPDATE SET permission_level = EXCLUDED.permission_level;

    UPDATE public.admin_invitations
      SET status = 'accepted', accepted_at = now(), accepted_user_id = NEW.id
      WHERE id = inv.id;

    INSERT INTO public.admin_audit_log
      (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES
      (NEW.id, NEW.email, 'admin_invitation_accepted', 'admin_invitation',
       inv.id::text, NEW.email,
       jsonb_build_object('permission_level', inv.permission_level,
                          'invited_by', inv.invited_by_email));
  END IF;

  -- Agency invitations (onboarding + staff)
  SELECT * INTO ag_inv FROM public.agency_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF ag_inv.id IS NOT NULL THEN
    IF ag_inv.kind = 'agency_onboarding' THEN
      IF ag_inv.agency_id IS NULL THEN
        INSERT INTO public.agencies (name, contact_email, contact_person, status, created_by)
        VALUES (ag_inv.agency_name, NEW.email, ag_inv.contact_person, 'accepted', NEW.id)
        RETURNING id INTO new_agency_id;
        UPDATE public.agency_invitations SET agency_id = new_agency_id WHERE id = ag_inv.id;
      ELSE
        new_agency_id := ag_inv.agency_id;
      END IF;

      INSERT INTO public.agency_members (agency_id, user_id, role, suspended)
      VALUES (new_agency_id, NEW.id, 'owner', false)
      ON CONFLICT DO NOTHING;

    ELSIF ag_inv.kind = 'staff' AND ag_inv.agency_id IS NOT NULL THEN
      INSERT INTO public.agency_members (agency_id, user_id, role, suspended)
      VALUES (ag_inv.agency_id, NEW.id, COALESCE(ag_inv.role, 'staff'), false)
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.agency_invitations
      SET status = 'accepted', accepted_at = now()
      WHERE id = ag_inv.id;
  END IF;

  -- Talent invitations (M2): link + provision folders
  SELECT * INTO tal_inv FROM public.talent_invitations
    WHERE lower(email) = lower(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;

  IF tal_inv.id IS NOT NULL THEN
    PERFORM public.accept_talent_invitation(tal_inv.id, NEW.id, NEW.email);
  END IF;

  RETURN NEW;
END;
$function$;
