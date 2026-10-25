DO $revert$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'MFA verified session required' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'MFA verified session required', p.schemaname, p.tablename);
  END LOOP;
END $revert$;
DROP POLICY IF EXISTS "MFA verified private storage required" ON storage.objects;
ALTER ROLE authenticator RESET pgrst.db_pre_request;
DROP FUNCTION IF EXISTS public.mfa_rest_guard();
REVOKE INSERT, UPDATE, DELETE ON public.mfa_settings, public.mfa_verified_sessions, public.mfa_codes FROM anon, authenticated;
COMMENT ON FUNCTION public.mfa_session_ok() IS 'DEFERRED TVA-SEC-101: retained inert helper; 2FA owned by the live app. Not used by build-level policies or middleware.';
COMMENT ON COLUMN public.mfa_codes.session_id IS 'DEFERRED TVA-SEC-101: retained nullable column; legacy build ignores this field.';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';