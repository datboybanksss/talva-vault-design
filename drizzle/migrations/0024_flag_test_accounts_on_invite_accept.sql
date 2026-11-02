-- Test-account scope for reporting: an invitation counts as test when the sending/linked
-- agency is_test, or the recipient email (plus-addressing ignored) matches a test account email.
-- Accepting such an invitation flags the new agency / talent account as is_test (audited).
-- Helpers are SECURITY INVOKER and only useful inside the SECURITY DEFINER triggers below.
-- Rollback:
--   DROP TRIGGER IF EXISTS flag_test_on_accept ON public.agency_invitations;
--   DROP TRIGGER IF EXISTS flag_test_on_accept ON public.talent_invitations;
--   DROP TRIGGER IF EXISTS flag_test_on_accept ON public.independent_talent_invitations;
--   DROP TRIGGER IF EXISTS flag_test_on_profile_insert ON public.talent_profiles;
--   DROP FUNCTION IF EXISTS public.flag_test_on_invite_accept(), public.flag_test_on_profile_insert(),
--     public.invitation_counts_as_test(text, uuid), public.is_test_email(text), public.test_email_key(text);

CREATE OR REPLACE FUNCTION public.test_email_key(_email text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN position('@' in lower(btrim(coalesce(_email,'')))) = 0 THEN lower(btrim(coalesce(_email,'')))
    ELSE split_part(split_part(lower(btrim(_email)), '@', 1), '+', 1) || '@' || split_part(lower(btrim(_email)), '@', 2) END
$$;

CREATE OR REPLACE FUNCTION public.is_test_email(_email text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(_email,'') <> '' AND EXISTS (
    SELECT 1 FROM (
      SELECT email AS e FROM public.talent_profiles WHERE is_test
      UNION ALL SELECT contact_email FROM public.agencies WHERE is_test
      UNION ALL SELECT main_contact_email FROM public.agencies WHERE is_test
      UNION ALL SELECT u.email::text FROM public.agency_members m
        JOIN public.agencies a ON a.id = m.agency_id AND a.is_test
        JOIN auth.users u ON u.id = m.user_id
    ) t WHERE t.e IS NOT NULL AND public.test_email_key(t.e) = public.test_email_key(_email))
$$;

CREATE OR REPLACE FUNCTION public.invitation_counts_as_test(_email text, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT is_test FROM public.agencies WHERE id = _agency_id), false)
      OR public.is_test_email(_email)
$$;

CREATE OR REPLACE FUNCTION public.flag_test_on_invite_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _agency uuid; _n int := 0;
BEGIN
  _agency := CASE WHEN TG_TABLE_NAME = 'independent_talent_invitations' THEN NULL ELSE (to_jsonb(NEW)->>'agency_id')::uuid END;
  IF NOT public.invitation_counts_as_test(NEW.email, _agency) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'agency_invitations' THEN
    IF (to_jsonb(NEW)->>'kind') = 'agency_onboarding' THEN
      UPDATE public.agencies SET is_test = true WHERE id = _agency AND NOT is_test;
      GET DIAGNOSTICS _n = ROW_COUNT;
    END IF;
  ELSE
    UPDATE public.talent_profiles SET is_test = true
      WHERE lower(btrim(email)) = lower(btrim(NEW.email)) AND NOT is_test;
    GET DIAGNOSTICS _n = ROW_COUNT;
  END IF;
  IF _n > 0 THEN
    INSERT INTO public.admin_audit_log (action, target_type, target_id, target_label, detail)
    VALUES ('account_marked_test_on_accept', CASE WHEN TG_TABLE_NAME='agency_invitations' THEN 'agency' ELSE 'talent' END,
      coalesce(_agency::text, NEW.id::text), NEW.email,
      jsonb_build_object('invitation_table', TG_TABLE_NAME, 'invitation_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.flag_test_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.is_test AND NEW.email IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.talent_invitations i WHERE lower(btrim(i.email)) = lower(btrim(NEW.email))
            AND i.status = 'accepted' AND public.invitation_counts_as_test(i.email, i.agency_id))
    OR EXISTS (SELECT 1 FROM public.independent_talent_invitations i WHERE lower(btrim(i.email)) = lower(btrim(NEW.email))
            AND i.status = 'accepted' AND public.is_test_email(i.email))) THEN
    NEW.is_test := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS flag_test_on_accept ON public.agency_invitations;
CREATE TRIGGER flag_test_on_accept AFTER UPDATE OF status ON public.agency_invitations
  FOR EACH ROW WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.flag_test_on_invite_accept();
DROP TRIGGER IF EXISTS flag_test_on_accept ON public.talent_invitations;
CREATE TRIGGER flag_test_on_accept AFTER UPDATE OF status ON public.talent_invitations
  FOR EACH ROW WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.flag_test_on_invite_accept();
DROP TRIGGER IF EXISTS flag_test_on_accept ON public.independent_talent_invitations;
CREATE TRIGGER flag_test_on_accept AFTER UPDATE OF status ON public.independent_talent_invitations
  FOR EACH ROW WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
  EXECUTE FUNCTION public.flag_test_on_invite_accept();
DROP TRIGGER IF EXISTS flag_test_on_profile_insert ON public.talent_profiles;
CREATE TRIGGER flag_test_on_profile_insert BEFORE INSERT ON public.talent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.flag_test_on_profile_insert();