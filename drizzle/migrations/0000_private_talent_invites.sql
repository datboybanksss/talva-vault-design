CREATE TABLE IF NOT EXISTS public.talent_invite_private (
  invitation_id uuid PRIMARY KEY REFERENCES public.talent_invitations(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.agency_talent_links(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('link_request','inert')),
  reason text,
  talent_user_id uuid,
  talent_profile_id uuid,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','declined','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS talent_invite_private_link_idx ON public.talent_invite_private(link_id);
CREATE INDEX IF NOT EXISTS talent_invite_private_talent_idx ON public.talent_invite_private(talent_user_id, agency_id);

REVOKE ALL ON public.talent_invite_private FROM anon, authenticated;
GRANT SELECT ON public.talent_invite_private TO authenticated;
GRANT ALL ON public.talent_invite_private TO service_role;
ALTER TABLE public.talent_invite_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read private invite records" ON public.talent_invite_private;
CREATE POLICY "Admins read private invite records" ON public.talent_invite_private
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.attach_talent_invite_private(_invitation_id uuid, _actor uuid, _actor_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv RECORD; lnk uuid; prof RECORD; ag_name text; why text;
BEGIN
  SELECT * INTO inv FROM public.talent_invitations WHERE id = _invitation_id;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT id INTO lnk FROM public.agency_talent_links WHERE talent_invitation_id = inv.id LIMIT 1;
  SELECT id, user_id INTO prof FROM public.talent_profiles
   WHERE lower(email) = lower(inv.email) AND user_id IS NOT NULL LIMIT 1;

  IF prof.id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(inv.email)) THEN
      RETURN 'no_account';
    END IF;
    why := 'staff_or_admin_account';
  ELSIF EXISTS (SELECT 1 FROM public.agency_talent_links
                 WHERE agency_id = inv.agency_id AND talent_user_id = prof.user_id
                   AND status IN ('active','needs_review','read_only')) THEN
    why := 'already_linked';
  ELSIF EXISTS (SELECT 1 FROM public.talent_invite_private p JOIN public.talent_invitations ti ON ti.id = p.invitation_id
                 WHERE p.agency_id = inv.agency_id AND p.talent_user_id = prof.user_id AND p.kind = 'link_request'
                   AND p.state = 'pending' AND ti.status = 'pending' AND ti.expires_at > now()) THEN
    why := 'request_already_open';
  ELSIF EXISTS (SELECT 1 FROM public.talent_invite_private
                 WHERE agency_id = inv.agency_id AND talent_user_id = prof.user_id
                   AND declined_at > now() - interval '30 days') THEN
    why := 'declined_cooldown';
  END IF;

  IF why IS NOT NULL THEN
    INSERT INTO public.talent_invite_private (invitation_id, link_id, agency_id, kind, reason, talent_user_id)
    VALUES (inv.id, lnk, inv.agency_id, 'inert', why, prof.user_id);
    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES (_actor, _actor_email, 'agency_talent_invite_inert', 'talent_invitation', inv.id::text, inv.email,
            jsonb_build_object('agency_id', inv.agency_id, 'reason', why, 'talent_name', inv.talent_name));
    RETURN 'inert';
  END IF;

  INSERT INTO public.talent_invite_private (invitation_id, link_id, agency_id, kind, talent_user_id, talent_profile_id)
  VALUES (inv.id, lnk, inv.agency_id, 'link_request', prof.user_id, prof.id);
  SELECT name INTO ag_name FROM public.agencies WHERE id = inv.agency_id;
  INSERT INTO public.talent_notifications (user_id, kind, dedupe_key, title, detail, tone, target_type, target_id)
  VALUES (prof.user_id, 'link_request', 'link_request:' || lnk::text,
          COALESCE(ag_name, 'An agency') || ' would like to connect with your TalVault',
          'Review the request to accept or decline.', 'teal', 'link_request', lnk::text)
  ON CONFLICT DO NOTHING;
  RETURN 'requested:' || lnk::text;
END; $$;

CREATE OR REPLACE FUNCTION public.reopen_talent_invite_private(_invitation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM public.talent_invite_private WHERE invitation_id = _invitation_id;
  IF p.invitation_id IS NULL OR p.kind <> 'link_request' OR p.state <> 'pending' THEN RETURN NULL; END IF;
  UPDATE public.talent_notifications SET read_at = NULL WHERE dedupe_key = 'link_request:' || p.link_id::text;
  DELETE FROM public.talent_notification_dismissals WHERE user_id = p.talent_user_id AND kind = 'link_request:' || p.link_id::text;
  RETURN p.link_id;
END; $$;

CREATE OR REPLACE FUNCTION public.close_talent_invite_private(_invitation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM public.talent_invite_private WHERE invitation_id = _invitation_id;
  IF p.invitation_id IS NULL OR p.state <> 'pending' THEN RETURN NULL; END IF;
  UPDATE public.talent_invite_private SET state = 'cancelled', cancelled_at = now() WHERE invitation_id = _invitation_id;
  IF p.kind <> 'link_request' THEN RETURN NULL; END IF;
  UPDATE public.talent_notifications SET read_at = now() WHERE dedupe_key = 'link_request:' || p.link_id::text;
  RETURN p.link_id;
END; $$;

CREATE OR REPLACE FUNCTION public.my_link_requests()
RETURNS TABLE(link_id uuid, agency_name text, requested_at timestamptz, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.link_id, COALESCE(a.name, 'An agency'), p.requested_at, ti.expires_at
    FROM public.talent_invite_private p
    JOIN public.talent_invitations ti ON ti.id = p.invitation_id
    LEFT JOIN public.agencies a ON a.id = p.agency_id
   WHERE p.talent_user_id = auth.uid() AND p.kind = 'link_request' AND p.state = 'pending'
     AND ti.status = 'pending' AND ti.expires_at > now()
   ORDER BY p.requested_at DESC
$$;

CREATE OR REPLACE FUNCTION public.respond_link_request(_link_id uuid, _accept boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p RECORD; inv RECORD; selected text[];
BEGIN
  SELECT * INTO p FROM public.talent_invite_private WHERE link_id = _link_id AND kind = 'link_request';
  IF p.invitation_id IS NULL OR p.talent_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO inv FROM public.talent_invitations WHERE id = p.invitation_id;
  IF p.state <> 'pending' OR inv.status <> 'pending' THEN RAISE EXCEPTION 'REQUEST_CLOSED: this request is no longer open'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'REQUEST_EXPIRED: this request has expired'; END IF;
  IF _accept THEN
    UPDATE public.agency_talent_links
       SET talent_user_id = p.talent_user_id, talent_profile_id = p.talent_profile_id, status = 'active',
           request_kind = 'link_request', requested_at = p.requested_at, request_expires_at = inv.expires_at,
           responded_at = now(), manager_user_id = COALESCE(manager_user_id, inv.manager_user_id),
           talent_type = COALESCE(talent_type, inv.talent_type), updated_at = now()
     WHERE id = _link_id;
    SELECT array_agg(x->>'name') INTO selected FROM jsonb_array_elements(COALESCE(inv.folder_selection, '[]'::jsonb)) x;
    PERFORM public.provision_talent_folders(p.agency_id, _link_id,
      CASE WHEN selected IS NULL OR array_length(selected, 1) IS NULL THEN NULL ELSE selected END, inv.talent_type);
    UPDATE public.talent_invitations SET status = 'accepted', accepted_at = now() WHERE id = inv.id;
    UPDATE public.talent_invite_private SET state = 'accepted', responded_at = now() WHERE invitation_id = p.invitation_id;
  ELSE
    UPDATE public.talent_invite_private SET state = 'declined', responded_at = now(), declined_at = now() WHERE invitation_id = p.invitation_id;
  END IF;
  UPDATE public.talent_notifications SET read_at = now() WHERE dedupe_key = 'link_request:' || _link_id::text;
  RETURN p.agency_id;
END; $$;

CREATE OR REPLACE FUNCTION public.accept_talent_invitation(_invitation_id uuid, _user_id uuid, _email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv RECORD; new_link_id uuid; new_profile_id uuid; selected text[];
BEGIN
  SELECT * INTO inv FROM public.talent_invitations WHERE id = _invitation_id AND status = 'pending' AND expires_at > now();
  IF inv.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.agency_talent_links WHERE talent_invitation_id = inv.id AND request_kind = 'link_request')
     OR EXISTS (SELECT 1 FROM public.talent_invite_private WHERE invitation_id = inv.id) THEN
    RETURN NULL;
  END IF;
  SELECT id INTO new_profile_id FROM public.talent_profiles WHERE user_id = _user_id LIMIT 1;
  IF new_profile_id IS NULL THEN
    INSERT INTO public.talent_profiles (user_id, agency_id, full_name, email)
    VALUES (_user_id, inv.agency_id, COALESCE(inv.talent_name, _email), _email) RETURNING id INTO new_profile_id;
  END IF;
  UPDATE public.agency_talent_links
     SET talent_user_id = _user_id, talent_profile_id = new_profile_id,
         display_name = COALESCE(inv.talent_name, _email), status = 'active',
         manager_user_id = COALESCE(manager_user_id, inv.manager_user_id),
         talent_type = COALESCE(talent_type, inv.talent_type), updated_at = now()
   WHERE talent_invitation_id = inv.id AND agency_id = inv.agency_id RETURNING id INTO new_link_id;
  IF new_link_id IS NULL THEN
    INSERT INTO public.agency_talent_links
      (agency_id, talent_user_id, talent_profile_id, talent_invitation_id, display_name, status, manager_user_id, talent_type)
    VALUES (inv.agency_id, _user_id, new_profile_id, inv.id, COALESCE(inv.talent_name, _email), 'active', inv.manager_user_id, inv.talent_type)
    RETURNING id INTO new_link_id;
  END IF;
  SELECT array_agg(x->>'name') INTO selected FROM jsonb_array_elements(COALESCE(inv.folder_selection, '[]'::jsonb)) x;
  PERFORM public.provision_talent_folders(inv.agency_id, new_link_id,
    CASE WHEN selected IS NULL OR array_length(selected, 1) IS NULL THEN NULL ELSE selected END, inv.talent_type);
  UPDATE public.talent_invitations SET status = 'accepted', accepted_at = now() WHERE id = inv.id;
  RETURN new_link_id;
END; $$;

REVOKE ALL ON FUNCTION public.attach_talent_invite_private(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_talent_invite_private(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_talent_invite_private(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_talent_invite_private(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reopen_talent_invite_private(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_talent_invite_private(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.my_link_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_link_requests() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_link_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_link_request(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_talent_invitation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_talent_invitation(uuid, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.request_talent_link(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resend_link_request(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_link_request(uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.request_talent_link(uuid, text, text, text, integer) IS 'DEPRECATED: replaced by attach_talent_invite_private';
COMMENT ON FUNCTION public.resend_link_request(uuid, timestamptz) IS 'DEPRECATED: replaced by reopen_talent_invite_private';
COMMENT ON FUNCTION public.cancel_link_request(uuid) IS 'DEPRECATED: replaced by close_talent_invite_private';