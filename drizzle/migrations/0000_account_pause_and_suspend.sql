ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS pause_note text,
  ADD COLUMN IF NOT EXISTS paused_banned_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suspension_note text;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS pause_note text,
  ADD COLUMN IF NOT EXISTS paused_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspension_note text;

COMMENT ON COLUMN public.agencies.pause_reason IS 'Internal only; never shown to the account.';
COMMENT ON COLUMN public.talent_profiles.pause_reason IS 'Internal only; never shown to the account.';
COMMENT ON COLUMN public.talent_profiles.suspension_reason IS 'Internal only; never shown to the account.';

CREATE OR REPLACE FUNCTION public.account_paused(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND NOT public.has_role(_user_id, 'admin') AND (
    EXISTS (SELECT 1 FROM public.talent_profiles t
            WHERE t.user_id = _user_id AND t.deleted_at IS NULL AND t.paused_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.agency_members m JOIN public.agencies a ON a.id = m.agency_id
               WHERE m.user_id = _user_id AND a.paused_at IS NOT NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.talent_read_only_until(_user_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.suspended_at + make_interval(years => public.post_end_read_only_years())
    FROM public.talent_profiles t
   WHERE t.user_id = _user_id AND t.deleted_at IS NULL AND t.suspended_at IS NOT NULL
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.talent_account_writable(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NULL OR public.has_role(_user_id, 'admin') OR NOT EXISTS (
    SELECT 1 FROM public.talent_profiles t
     WHERE t.user_id = _user_id AND t.deleted_at IS NULL AND t.suspended_at IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.account_read_allowed(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.account_paused(_user_id)
     AND COALESCE(public.talent_read_only_until(_user_id) > now(), true);
$$;

CREATE OR REPLACE FUNCTION public.my_account_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'paused', public.account_paused(auth.uid()),
    'talent_suspended', NOT public.talent_account_writable(auth.uid()),
    'talent_read_until', public.talent_read_only_until(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.my_account_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.account_state_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'agencies' THEN
    IF (NEW.paused_at, NEW.paused_by, NEW.pause_reason, NEW.pause_note, NEW.paused_banned_user_ids,
        NEW.suspension_note, NEW.suspended_at, NEW.suspended_by, NEW.suspension_reason)
       IS DISTINCT FROM
       (OLD.paused_at, OLD.paused_by, OLD.pause_reason, OLD.pause_note, OLD.paused_banned_user_ids,
        OLD.suspension_note, OLD.suspended_at, OLD.suspended_by, OLD.suspension_reason)
       OR (NEW.status IS DISTINCT FROM OLD.status AND 'suspended' IN (NEW.status::text, OLD.status::text)) THEN
      RAISE EXCEPTION 'Only an administrator can pause or suspend an account.';
    END IF;
  ELSE
    IF (NEW.paused_at, NEW.paused_by, NEW.pause_reason, NEW.pause_note, NEW.paused_banned,
        NEW.suspended_at, NEW.suspended_by, NEW.suspension_reason, NEW.suspension_note)
       IS DISTINCT FROM
       (OLD.paused_at, OLD.paused_by, OLD.pause_reason, OLD.pause_note, OLD.paused_banned,
        OLD.suspended_at, OLD.suspended_by, OLD.suspension_reason, OLD.suspension_note) THEN
      RAISE EXCEPTION 'Only an administrator can pause or suspend an account.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS account_state_guard ON public.agencies;
CREATE TRIGGER account_state_guard BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.account_state_guard();
DROP TRIGGER IF EXISTS account_state_guard ON public.talent_profiles;
CREATE TRIGGER account_state_guard BEFORE UPDATE ON public.talent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.account_state_guard();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS s, c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND c.relrowsecurity
       AND (n.nspname = 'public' OR (n.nspname = 'storage' AND c.relname = 'objects'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'Paused account blocked', r.s, r.t);
    EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.account_read_allowed(auth.uid()))) WITH CHECK ((SELECT public.account_read_allowed(auth.uid())))', 'Paused account blocked', r.s, r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'Suspended talent read-only insert', r.s, r.t);
    EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.talent_account_writable(auth.uid())))', 'Suspended talent read-only insert', r.s, r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'Suspended talent read-only update', r.s, r.t);
    EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.talent_account_writable(auth.uid()))) WITH CHECK ((SELECT public.talent_account_writable(auth.uid())))', 'Suspended talent read-only update', r.s, r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'Suspended talent read-only delete', r.s, r.t);
    EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.talent_account_writable(auth.uid())))', 'Suspended talent read-only delete', r.s, r.t);
  END LOOP;
END $$;