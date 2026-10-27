INSERT INTO public.platform_settings (key, value) VALUES ('mfa_enforced', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.mfa_enforced()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT value = 'true'::jsonb FROM public.platform_settings WHERE key = 'mfa_enforced'), false);
$$;
REVOKE ALL ON FUNCTION public.mfa_enforced() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_enforced() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mfa_session_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT NOT public.mfa_enforced()
    OR (auth.uid() IS NOT NULL
      AND NULLIF(auth.jwt()->>'session_id', '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.mfa_verified_sessions v
        WHERE v.user_id = auth.uid()
          AND v.session_id = auth.jwt()->>'session_id'
          AND v.verified_at > now() - interval '12 hours'
          AND v.verified_at <= now()));
$$;
REVOKE ALL ON FUNCTION public.mfa_session_ok() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mfa_session_ok() FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_session_ok() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mfa_switch_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.key = 'mfa_enforced' AND (TG_OP = 'INSERT' OR OLD.value IS DISTINCT FROM NEW.value) THEN
    IF NEW.value NOT IN ('true'::jsonb, 'false'::jsonb) THEN
      RAISE EXCEPTION 'mfa_enforced must be true or false';
    END IF;
    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES (auth.uid(), auth.jwt()->>'email', 'mfa_enforcement_changed', 'platform_setting', 'mfa_enforced',
      'Two-step sign-in enforcement',
      jsonb_build_object('from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END, 'to', NEW.value,
        'by_service_role', auth.uid() IS NULL));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mfa_switch_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS mfa_switch_audit ON public.platform_settings;
CREATE TRIGGER mfa_switch_audit AFTER INSERT OR UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.mfa_switch_audit();