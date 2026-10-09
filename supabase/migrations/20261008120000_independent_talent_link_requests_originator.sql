-- Independent talent (invite-only): invitations, link requests, originator, billing link
-- Recorded here from the Drizzle folder so all history lives in supabase/migrations.
-- These statements were ALREADY APPLIED to the live database. The guard below makes
-- this file a no-op wherever the objects already exist, so it can never re-apply
-- or duplicate anything; on a fresh database it applies the change once.
--
-- ROLLBACK (run manually, in this order, only if this change must be undone):
--   SELECT cron.unschedule('expire-link-requests');
--   DROP POLICY IF EXISTS "Talent removes own originated docs" ON public.talent_shared_documents;
--   -- restore the previous bodies of the "Agency or talent read shared docs",
--   -- "Agency updates shared docs" and "Agency deletes shared docs" policies and of
--   -- tsd_after_insert_refresh_lock, enforce_retention_lock_delete,
--   -- retention_rule_refresh_docs and handle_new_user from migration 20260922184906.
--   DROP FUNCTION IF EXISTS public.talent_can_read_shared_doc(uuid, text, integer);
--   DROP FUNCTION IF EXISTS public.expire_link_requests();
--   DROP FUNCTION IF EXISTS public.cancel_link_request(uuid);
--   DROP FUNCTION IF EXISTS public.respond_link_request(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.request_talent_link(uuid, text, text, text, integer);
--   DROP TRIGGER IF EXISTS agency_talent_links_guard_insert ON public.agency_talent_links;
--   DROP FUNCTION IF EXISTS public.guard_talent_link_insert();
--   DROP FUNCTION IF EXISTS public.accept_independent_talent_invitation(uuid, uuid, text);
--   ALTER TABLE public.agency_billing_docs DROP COLUMN IF EXISTS talent_link_id;
--   ALTER TABLE public.talent_shared_documents DROP CONSTRAINT IF EXISTS talent_shared_documents_originator_chk,
--     DROP COLUMN IF EXISTS originator;
--   DROP INDEX IF EXISTS public.agency_talent_links_open_request_uq;
--   ALTER TABLE public.agency_talent_links DROP CONSTRAINT IF EXISTS agency_talent_links_request_kind_chk,
--     DROP COLUMN IF EXISTS request_kind, DROP COLUMN IF EXISTS requested_at, DROP COLUMN IF EXISTS request_expires_at,
--     DROP COLUMN IF EXISTS responded_at, DROP COLUMN IF EXISTS declined_at, DROP COLUMN IF EXISTS cancelled_at;
--   DROP POLICY IF EXISTS "Admins read talent invite files" ON storage.objects;
--   DROP POLICY IF EXISTS "Admins upload talent invite files" ON storage.objects;
--   DROP POLICY IF EXISTS "Admins delete talent invite files" ON storage.objects;
--   DROP TABLE IF EXISTS public.talent_invitation_documents;
--   DROP TABLE IF EXISTS public.independent_talent_invitations;

DO $guard$
BEGIN
  IF to_regclass('public.independent_talent_invitations') IS NOT NULL THEN
    RAISE NOTICE 'already applied, skipping';
    RETURN;
  END IF;
  EXECUTE $mig$
CREATE TABLE public.independent_talent_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_name text NOT NULL,
  email text NOT NULL,
  talent_type text,
  date_of_birth date,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status public.invitation_status NOT NULL DEFAULT 'draft',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  invited_by uuid,
  accepted_at timestamptz,
  accepted_user_id uuid,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  email_sent_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX independent_talent_invitations_token_uq ON public.independent_talent_invitations (token);
CREATE INDEX independent_talent_invitations_email_idx ON public.independent_talent_invitations (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.independent_talent_invitations TO authenticated;
GRANT ALL ON public.independent_talent_invitations TO service_role;
ALTER TABLE public.independent_talent_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read independent talent invites" ON public.independent_talent_invitations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins create independent talent invites" ON public.independent_talent_invitations FOR INSERT TO authenticated WITH CHECK (public.can_admin_edit(auth.uid()));
CREATE POLICY "Admins update independent talent invites" ON public.independent_talent_invitations FOR UPDATE TO authenticated USING (public.can_admin_edit(auth.uid())) WITH CHECK (public.can_admin_edit(auth.uid()));
CREATE POLICY "Admins delete independent talent invites" ON public.independent_talent_invitations FOR DELETE TO authenticated USING (public.can_admin_edit(auth.uid()));
CREATE TRIGGER independent_talent_invitations_touch BEFORE UPDATE ON public.independent_talent_invitations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.talent_invitation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.independent_talent_invitations(id) ON DELETE CASCADE,
  doc_slot text NOT NULL CHECK (doc_slot IN ('id_document','proof_of_talent')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX talent_invitation_documents_slot_uq ON public.talent_invitation_documents (invitation_id, doc_slot);
CREATE UNIQUE INDEX talent_invitation_documents_name_uq ON public.talent_invitation_documents (invitation_id, lower(file_name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_invitation_documents TO authenticated;
GRANT ALL ON public.talent_invitation_documents TO service_role;
ALTER TABLE public.talent_invitation_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read talent invite docs" ON public.talent_invitation_documents FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins add talent invite docs" ON public.talent_invitation_documents FOR INSERT TO authenticated WITH CHECK (public.can_admin_edit(auth.uid()));
CREATE POLICY "Admins remove talent invite docs" ON public.talent_invitation_documents FOR DELETE TO authenticated USING (public.can_admin_edit(auth.uid()));

CREATE POLICY "Admins read talent invite files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'talent-invite-docs' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload talent invite files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'talent-invite-docs' AND public.can_admin_edit(auth.uid()));
CREATE POLICY "Admins delete talent invite files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'talent-invite-docs' AND public.can_admin_edit(auth.uid()));

CREATE OR REPLACE FUNCTION public.accept_independent_talent_invitation(_invitation_id uuid, _user_id uuid, _email text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE inv RECORD; pid uuid;
BEGIN
  SELECT * INTO inv FROM public.independent_talent_invitations
   WHERE id = _invitation_id AND status = 'pending' AND expires_at > now();
  IF inv.id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO pid FROM public.talent_profiles WHERE user_id = _user_id LIMIT 1;
  IF pid IS NULL THEN
    INSERT INTO public.talent_profiles (user_id, agency_id, full_name, email)
    VALUES (_user_id, NULL, COALESCE(inv.talent_name, _email), _email)
    RETURNING id INTO pid;
  END IF;
  UPDATE public.independent_talent_invitations
     SET status = 'accepted', accepted_at = now(), accepted_user_id = _user_id
   WHERE id = inv.id;
  RETURN pid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_independent_talent_invitation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD; ag_inv RECORD; tal_inv RECORD; ind_inv RECORD; new_agency_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'israel@npiconsulting.co.za' THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', true, 'edit')
    ON CONFLICT (user_id, role) DO UPDATE SET is_main_admin = true, permission_level = 'edit';
  END IF;

  SELECT * INTO inv FROM public.admin_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', false, inv.permission_level)
    ON CONFLICT (user_id, role) DO UPDATE SET permission_level = EXCLUDED.permission_level;
    UPDATE public.admin_invitations SET status = 'accepted', accepted_at = now(), accepted_user_id = NEW.id WHERE id = inv.id;
    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES (NEW.id, NEW.email, 'admin_invitation_accepted', 'admin_invitation', inv.id::text, NEW.email,
       jsonb_build_object('permission_level', inv.permission_level, 'invited_by', inv.invited_by_email));
  END IF;

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
        UPDATE public.agencies SET status = 'accepted', updated_at = now()
         WHERE id = new_agency_id AND status IN ('incomplete', 'invited');
      END IF;
      INSERT INTO public.agency_members (agency_id, user_id, role, suspended)
      VALUES (new_agency_id, NEW.id, 'owner', false) ON CONFLICT DO NOTHING;
    ELSIF ag_inv.kind = 'staff' AND ag_inv.agency_id IS NOT NULL THEN
      INSERT INTO public.agency_members (agency_id, user_id, role, suspended)
      VALUES (ag_inv.agency_id, NEW.id, COALESCE(ag_inv.role, 'staff'), false) ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.agency_invitations SET status = 'accepted', accepted_at = now() WHERE id = ag_inv.id;
  END IF;

  SELECT * INTO tal_inv FROM public.talent_invitations
    WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  IF tal_inv.id IS NOT NULL THEN
    PERFORM public.accept_talent_invitation(tal_inv.id, NEW.id, NEW.email);
  END IF;

  SELECT * INTO ind_inv FROM public.independent_talent_invitations
    WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  IF ind_inv.id IS NOT NULL THEN
    PERFORM public.accept_independent_talent_invitation(ind_inv.id, NEW.id, NEW.email);
  END IF;

  RETURN NEW;
END;
$function$;

ALTER TABLE public.agency_talent_links ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'invite';
ALTER TABLE public.agency_talent_links ADD CONSTRAINT agency_talent_links_request_kind_chk CHECK (request_kind IN ('invite','link_request'));
ALTER TABLE public.agency_talent_links ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE public.agency_talent_links ADD COLUMN IF NOT EXISTS request_expires_at timestamptz;
ALTER TABLE public.agency_talent_links ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE public.agency_talent_links ADD COLUMN IF NOT EXISTS declined_at timestamptz;
ALTER TABLE public.agency_talent_links ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS agency_talent_links_open_request_uq
  ON public.agency_talent_links (agency_id, talent_user_id)
  WHERE status = 'invited' AND talent_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_talent_link_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_agency_member(auth.uid(), NEW.agency_id) THEN
    RAISE EXCEPTION 'LINK_FORBIDDEN: only a member of this agency can connect talent to it';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agency_talent_links_guard_insert BEFORE INSERT ON public.agency_talent_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_talent_link_insert();

CREATE OR REPLACE FUNCTION public.request_talent_link(_agency_id uuid, _email text, _talent_type text DEFAULT NULL)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE prof RECORD; ag_name text; existing RECORD; new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_agency_member(auth.uid(), _agency_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id, user_id, full_name INTO prof FROM public.talent_profiles
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
  SELECT name INTO ag_name FROM public.agencies WHERE id = _agency_id;
  INSERT INTO public.agency_talent_links
    (agency_id, talent_user_id, talent_profile_id, display_name, status, talent_type,
     request_kind, requested_at, request_expires_at)
  VALUES (_agency_id, prof.user_id, prof.id, COALESCE(prof.full_name, _email), 'invited', _talent_type,
     'link_request', now(), now() + interval '14 days')
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
  ELSE
    UPDATE public.agency_talent_links SET status = 'revoked', responded_at = now(), declined_at = now() WHERE id = _link_id;
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
  IF l.request_kind <> 'link_request' OR l.status <> 'invited' THEN RAISE EXCEPTION 'REQUEST_CLOSED: this request is no longer open'; END IF;
  UPDATE public.agency_talent_links SET status = 'revoked', cancelled_at = now() WHERE id = _link_id;
  UPDATE public.talent_notifications SET read_at = now() WHERE dedupe_key = 'link_request:' || _link_id::text;
  RETURN l.talent_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_link_requests()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  UPDATE public.agency_talent_links SET status = 'expired'
   WHERE request_kind = 'link_request' AND status = 'invited'
     AND request_expires_at IS NOT NULL AND request_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_link_requests() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('expire-link-requests', '17 * * * *', $c$ SELECT public.expire_link_requests(); $c$);

ALTER TABLE public.talent_shared_documents ADD COLUMN IF NOT EXISTS originator text NOT NULL DEFAULT 'agency';
UPDATE public.talent_shared_documents d SET originator = 'talent'
  FROM public.agency_talent_links l
 WHERE l.id = d.talent_link_id AND d.uploaded_by IS NOT NULL AND d.uploaded_by = l.talent_user_id;
ALTER TABLE public.talent_shared_documents ADD CONSTRAINT talent_shared_documents_originator_chk CHECK (originator IN ('agency','talent'));

CREATE OR REPLACE FUNCTION public.tsd_after_insert_refresh_lock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _years integer;
BEGIN
  IF NEW.originator = 'talent' THEN RETURN NEW; END IF;
  _years := public.resolve_document_retention_years(NEW.id);
  IF _years IS NOT NULL THEN
    UPDATE public.talent_shared_documents
       SET locked_until = NEW.created_at + make_interval(years => _years),
           retention_years_at_upload = _years, retention_stamped_at = now()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_retention_lock_delete()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.originator = 'talent' THEN RETURN OLD; END IF;
  IF OLD.locked_until IS NOT NULL AND OLD.locked_until > now() THEN
    RAISE EXCEPTION 'RETENTION_LOCKED: document is locked until %', OLD.locked_until;
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retention_rule_refresh_docs()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  r := NEW;
  IF r.scope = 'document' THEN
    UPDATE public.talent_shared_documents d
       SET locked_until = d.created_at + make_interval(years => r.retention_years),
           retention_years_at_upload = r.retention_years, retention_stamped_at = now()
     WHERE d.id = r.document_id AND d.originator = 'agency'
       AND (d.locked_until IS NULL OR d.created_at + make_interval(years => r.retention_years) > d.locked_until);
  ELSE
    UPDATE public.talent_shared_documents d
       SET locked_until = d.created_at + make_interval(years => r.retention_years),
           retention_years_at_upload = r.retention_years, retention_stamped_at = now()
     WHERE d.agency_id = r.agency_id AND d.folder = r.scope_value AND d.originator = 'agency'
       AND (d.locked_until IS NULL OR d.created_at + make_interval(years => r.retention_years) > d.locked_until);
  END IF;
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.talent_can_read_shared_doc(_link_id uuid, _originator text, _years integer, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_talent_links l
     WHERE l.id = _link_id AND l.talent_user_id = _user_id
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
  OR public.talent_can_read_shared_doc(talent_link_id, originator, retention_years_at_upload, auth.uid())
);

ALTER POLICY "Agency updates shared docs" ON public.talent_shared_documents
USING (
  originator = 'agency' AND public.is_agency_member(auth.uid(), agency_id)
  AND (talent_link_id IS NULL OR NOT public.talent_link_is_ended(talent_link_id))
  AND (talent_link_id IS NULL OR public.can_access_talent_folder(auth.uid(), talent_link_id, public.is_restricted_folder_name(agency_id, folder)))
);

ALTER POLICY "Agency deletes shared docs" ON public.talent_shared_documents
USING (
  originator = 'agency' AND public.is_agency_member(auth.uid(), agency_id)
  AND (talent_link_id IS NULL OR NOT public.talent_link_is_ended(talent_link_id))
  AND (talent_link_id IS NULL OR public.can_access_talent_folder(auth.uid(), talent_link_id, public.is_restricted_folder_name(agency_id, folder)))
);

CREATE POLICY "Talent removes own originated docs" ON public.talent_shared_documents FOR DELETE TO authenticated
USING (
  originator = 'talent' AND EXISTS (
    SELECT 1 FROM public.agency_talent_links l WHERE l.id = talent_link_id AND l.talent_user_id = auth.uid())
);

ALTER TABLE public.agency_billing_docs ADD COLUMN IF NOT EXISTS talent_link_id uuid REFERENCES public.agency_talent_links(id) ON DELETE SET NULL;
UPDATE public.agency_billing_docs d SET talent_link_id = m.link_id
  FROM (
    SELECT d2.id AS doc_id, (array_agg(l.id))[1] AS link_id
      FROM public.agency_billing_docs d2
      JOIN public.agency_talent_links l
        ON l.agency_id = d2.agency_id AND lower(l.display_name) = lower(d2.talent_name)
     GROUP BY d2.id HAVING count(*) = 1
  ) m
 WHERE d.id = m.doc_id AND d.talent_link_id IS NULL;
CREATE INDEX IF NOT EXISTS agency_billing_docs_talent_link_idx ON public.agency_billing_docs (talent_link_id);
$mig$;
END
$guard$;
