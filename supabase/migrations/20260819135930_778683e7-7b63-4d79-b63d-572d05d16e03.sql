ALTER TABLE public.talent_invitations
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS talent_type text;

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
  folder jsonb;
  idx int := 0;
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
$function$;