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

  -- Convert the placeholder roster row created at invite time, if present.
  UPDATE public.agency_talent_links
     SET talent_user_id = _user_id,
         talent_profile_id = new_profile_id,
         display_name = COALESCE(inv.talent_name, _email),
         status = 'active',
         manager_user_id = COALESCE(manager_user_id, inv.manager_user_id),
         talent_type = COALESCE(talent_type, inv.talent_type),
         updated_at = now()
   WHERE talent_invitation_id = inv.id
     AND agency_id = inv.agency_id
   RETURNING id INTO new_link_id;

  IF new_link_id IS NULL THEN
    INSERT INTO public.agency_talent_links
      (agency_id, talent_user_id, talent_profile_id, talent_invitation_id,
       display_name, status, manager_user_id, talent_type)
    VALUES
      (inv.agency_id, _user_id, new_profile_id, inv.id,
       COALESCE(inv.talent_name, _email), 'active', inv.manager_user_id, inv.talent_type)
    RETURNING id INTO new_link_id;
  END IF;

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