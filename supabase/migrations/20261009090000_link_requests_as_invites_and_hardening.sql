-- Link requests as invitations, function hardening, talent-item locks cleared
-- Recorded here from the Drizzle folder so all history lives in supabase/migrations.
-- These statements were ALREADY APPLIED to the live database. The guard below makes
-- this file a no-op wherever the objects already exist, so it can never re-apply
-- or duplicate anything; on a fresh database it applies the change once.
--
-- ROLLBACK (run manually, only if this change must be undone):
--   DROP FUNCTION IF EXISTS public.resend_link_request(uuid, timestamptz);
--   DROP FUNCTION IF EXISTS public.request_talent_link(uuid, text, text, text, integer);
--   -- recreate request_talent_link(uuid, text, text), respond_link_request, cancel_link_request,
--   -- accept_talent_invitation and tsd_protect_retention_lock from the previous migration bodies;
--   CREATE OR REPLACE FUNCTION public.talent_can_read_shared_doc(_link_id uuid, _originator text, _years integer, _user_id uuid) ...;
--   ALTER POLICY "Agency or talent read shared docs" ON public.talent_shared_documents USING (... talent_can_read_shared_doc(talent_link_id, originator, retention_years_at_upload, auth.uid()));
--   DROP FUNCTION IF EXISTS public.talent_can_read_shared_doc(uuid, text, integer);
--   -- cleared retention stamps on talent-originated documents are not restored (they were never meant to apply).

DO $guard$
BEGIN
  IF to_regprocedure('public.resend_link_request(uuid, timestamptz)') IS NOT NULL THEN
    RAISE NOTICE 'already applied, skipping';
    RETURN;
  END IF;
  EXECUTE $mig$
-- 1. Link requests carry an ordinary talent invitation row (token, agency-typed name)
DROP FUNCTION IF EXISTS public.request_talent_link(uuid, text, text);

CREATE OR REPLACE FUNCTION public.request_talent_link(_agency_id uuid, _email text, _display_name text, _talent_type text DEFAULT NULL, _expiry_days integer DEFAULT 14)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE prof RECORD; ag_name text; existing RECORD; new_id uuid; inv_id uuid; exp timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_agency_member(auth.uid(), _agency_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id, user_id INTO prof FROM public.talent_profiles
   WHERE lower(email) = lower(_email) AND user_id IS NOT NULL LIMIT 1;
  IF prof.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(_email)) THEN
      RETURN 'other_account';
    END IF;
    RETURN 'no_account';
  END IF;
  SELECT * INTO existing FROM public.agency_talent_links
   WHERE agency_id = _agency_id AND talent_user_id = prof.user_id
   ORDER BY created_at DESC LIMIT 1;
  IF existing.id IS NOT NULL AND existing.status IN ('active','invited','needs_review','read_only') THEN
    RETURN 'already_linked';
  END IF;
  IF existing.id IS NOT NULL AND existing.declined_at IS NOT NULL AND existing.declined_at > now() - interval '30 days' THEN
    RETURN 'cooldown';
  END IF;
  exp := now() + make_interval(days => GREATEST(1, LEAST(COALESCE(_expiry_days, 14), 60)));
  SELECT name INTO ag_name FROM public.agencies WHERE id = _agency_id;
  INSERT INTO public.talent_invitations (agency_id, talent_name, email, expires_at, invited_by, talent_type)
  VALUES (_agency_id, _display_name, _email, exp, auth.uid(), _talent_type)
  RETURNING id INTO inv_id;
  INSERT INTO public.agency_talent_links
    (agency_id, talent_user_id, talent_profile_id, talent_invitation_id, display_name, status, talent_type,
     request_kind, requested_at, request_expires_at)
  VALUES (_agency_id, prof.user_id, prof.id, inv_id, _display_name, 'invited', _talent_type,
     'link_request', now(), exp)
  RETURNING id INTO new_id;
  INSERT INTO public.talent_notifications (user_id, kind, dedupe_key, title, detail, tone, target_type, target_id)
  VALUES (prof.user_id, 'link_request', 'link_request:' || new_id::text,
          COALESCE(ag_name, 'An agency') || ' would like to connect with your TalVault',
          'Review the request to accept or decline.', 'teal', 'link_request', new_id::text);
  RETURN 'requested:' || new_id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_link_request(_link_id uuid, _accept boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE l RECORD;
BEGIN
  SELECT * INTO l FROM public.agency_talent_links WHERE id = _link_id;
  IF l.id IS NULL OR l.talent_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF l.request_kind <> 'link_request' OR l.status <> 'invited' THEN RAISE EXCEPTION 'REQUEST_CLOSED: this request is no longer open'; END IF;
  IF l.request_expires_at IS NOT NULL AND l.request_expires_at < now() THEN
    RAISE EXCEPTION 'REQUEST_EXPIRED: this request has expired';
  END IF;
  IF _accept THEN
    UPDATE public.agency_talent_links SET status = 'active', responded_at = now() WHERE id = _link_id;
    PERFORM public.provision_talent_folders(l.agency_id, l.id, NULL, l.talent_type);
    UPDATE public.talent_invitations SET status = 'accepted', accepted_at = now() WHERE id = l.talent_invitation_id;
  ELSE
    UPDATE public.agency_talent_links SET status = 'revoked', responded_at = now(), declined_at = now() WHERE id = _link_id;
    UPDATE public.talent_invitations SET status = 'declined' WHERE id = l.talent_invitation_id;
  END IF;
  UPDATE public.talent_notifications SET read_at = now() WHERE dedupe_key = 'link_request:' || _link_id::text;
  RETURN l.agency_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_link_request(_link_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE l RECORD;
BEGIN
  SELECT * INTO l FROM public.agency_talent_links WHERE id = _link_id;
  IF l.id IS NULL OR NOT public.is_agency_member(auth.uid(), l.agency_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF l.request_kind <> 'link_request' OR l.status NOT IN ('invited','expired') THEN RAISE EXCEPTION 'REQUEST_CLOSED: this request is no longer open'; END IF;
  UPDATE public.agency_talent_links SET status = 'revoked', cancelled_at = now() WHERE id = _link_id;
  UPDATE public.talent_invitations SET status = 'revoked' WHERE id = l.talent_invitation_id AND status = 'pending';
  UPDATE public.talent_notifications SET read_at = now() WHERE dedupe_key = 'link_request:' || _link_id::text;
  RETURN l.talent_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_link_request(_link_id uuid, _expires_at timestamptz)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE l RECORD;
BEGIN
  SELECT * INTO l FROM public.agency_talent_links WHERE id = _link_id;
  IF l.id IS NULL OR NOT public.is_agency_member(auth.uid(), l.agency_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF l.request_kind <> 'link_request' OR l.status NOT IN ('invited','expired') THEN RAISE EXCEPTION 'REQUEST_CLOSED: this request is no longer open'; END IF;
  UPDATE public.agency_talent_links SET status = 'invited', request_expires_at = _expires_at, updated_at = now() WHERE id = _link_id;
  UPDATE public.talent_notifications SET read_at = NULL WHERE dedupe_key = 'link_request:' || _link_id::text;
  DELETE FROM public.talent_notification_dismissals WHERE user_id = l.talent_user_id AND kind = 'link_request:' || _link_id::text;
  RETURN l.talent_user_id;
END;
$$;

-- 2. A link-request invitation can never be accepted through the invite-claim path
CREATE OR REPLACE FUNCTION public.accept_talent_invitation(_invitation_id uuid, _user_id uuid, _email text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD; new_link_id uuid; new_profile_id uuid; selected text[];
BEGIN
  SELECT * INTO inv FROM public.talent_invitations
   WHERE id = _invitation_id AND status = 'pending' AND expires_at > now();
  IF inv.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.agency_talent_links
              WHERE talent_invitation_id = inv.id AND request_kind = 'link_request') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO new_profile_id FROM public.talent_profiles WHERE user_id = _user_id LIMIT 1;
  IF new_profile_id IS NULL THEN
    INSERT INTO public.talent_profiles (user_id, agency_id, full_name, email)
    VALUES (_user_id, inv.agency_id, COALESCE(inv.talent_name, _email), _email)
    RETURNING id INTO new_profile_id;
  END IF;

  UPDATE public.agency_talent_links
     SET talent_user_id = _user_id, talent_profile_id = new_profile_id,
         display_name = COALESCE(inv.talent_name, _email), status = 'active',
         manager_user_id = COALESCE(manager_user_id, inv.manager_user_id),
         talent_type = COALESCE(talent_type, inv.talent_type), updated_at = now()
   WHERE talent_invitation_id = inv.id AND agency_id = inv.agency_id
   RETURNING id INTO new_link_id;

  IF new_link_id IS NULL THEN
    INSERT INTO public.agency_talent_links
      (agency_id, talent_user_id, talent_profile_id, talent_invitation_id, display_name, status, manager_user_id, talent_type)
    VALUES (inv.agency_id, _user_id, new_profile_id, inv.id, COALESCE(inv.talent_name, _email), 'active', inv.manager_user_id, inv.talent_type)
    RETURNING id INTO new_link_id;
  END IF;

  SELECT array_agg(x->>'name') INTO selected
    FROM jsonb_array_elements(COALESCE(inv.folder_selection, '[]'::jsonb)) x;

  PERFORM public.provision_talent_folders(
    inv.agency_id, new_link_id,
    CASE WHEN selected IS NULL OR array_length(selected, 1) IS NULL THEN NULL ELSE selected END,
    inv.talent_type);

  UPDATE public.talent_invitations SET status = 'accepted', accepted_at = now() WHERE id = inv.id;
  RETURN new_link_id;
END;
$function$;

-- 3. Shared-doc read check no longer trusts a caller-supplied user id
CREATE OR REPLACE FUNCTION public.talent_can_read_shared_doc(_link_id uuid, _originator text, _years integer)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agency_talent_links l
     WHERE l.id = _link_id AND l.talent_user_id = auth.uid()
       AND (
         _originator = 'talent'
         OR l.status NOT IN ('ended','revoked','expired')
         OR l.ended_at IS NULL
         OR _years IS NULL
         OR l.ended_at + make_interval(years => _years) > now()
       )
  );
$$;

ALTER POLICY "Agency or talent read shared docs" ON public.talent_shared_documents
USING (
  (public.is_agency_member(auth.uid(), agency_id)
    AND (talent_link_id IS NULL OR public.can_access_talent_folder(auth.uid(), talent_link_id, public.is_restricted_folder_name(agency_id, folder))))
  OR public.talent_can_read_shared_doc(talent_link_id, originator, retention_years_at_upload)
);

DROP FUNCTION IF EXISTS public.talent_can_read_shared_doc(uuid, text, integer, uuid);

-- 4. Function exposure
REVOKE EXECUTE ON FUNCTION public.talent_can_read_shared_doc(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talent_can_read_shared_doc(uuid, text, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.request_talent_link(uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_talent_link(uuid, text, text, text, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.respond_link_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_link_request(uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_link_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_link_request(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resend_link_request(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_link_request(uuid, timestamptz) TO authenticated, service_role;

-- 5. Talent-originated items never carry retention locks
CREATE OR REPLACE FUNCTION public.tsd_protect_retention_lock()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.originator = 'talent' THEN
    NEW.locked_until := NULL;
    NEW.retention_years_at_upload := NULL;
    NEW.retention_stamped_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.locked_until IS NOT NULL
     AND (NEW.locked_until IS NULL OR NEW.locked_until < OLD.locked_until) THEN
    NEW.locked_until := OLD.locked_until;
  END IF;
  IF OLD.retention_years_at_upload IS NOT NULL
     AND (NEW.retention_years_at_upload IS NULL
          OR NEW.retention_years_at_upload < OLD.retention_years_at_upload) THEN
    NEW.retention_years_at_upload := OLD.retention_years_at_upload;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.talent_shared_documents
   SET locked_until = NULL, retention_years_at_upload = NULL, retention_stamped_at = NULL
 WHERE originator = 'talent'
   AND (locked_until IS NOT NULL OR retention_years_at_upload IS NOT NULL OR retention_stamped_at IS NOT NULL);
$mig$;
END
$guard$;
