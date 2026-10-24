-- Guarded history copy: already applied through the migration tool.
DO $history$ BEGIN
  IF to_regprocedure('public.mfa_rest_guard()') IS NULL THEN
    EXECUTE $migration$
-- TVA-SEC-101. Old device markers are deliberately not converted to JWT sessions.
ALTER TABLE public.mfa_codes ADD COLUMN IF NOT EXISTS session_id text;
CREATE OR REPLACE FUNCTION public.mfa_session_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NULLIF(auth.jwt()->>'session_id', '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.mfa_verified_sessions v
      WHERE v.user_id = auth.uid()
        AND v.session_id = auth.jwt()->>'session_id'
        AND v.verified_at > now() - interval '12 hours'
        AND v.verified_at <= now()
    );
$$;
REVOKE ALL ON FUNCTION public.mfa_session_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_session_ok() TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.mfa_settings, public.mfa_verified_sessions, public.mfa_codes FROM authenticated, anon;
GRANT ALL ON public.mfa_settings, public.mfa_verified_sessions, public.mfa_codes TO service_role;
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('mfa_settings', 'mfa_verified_sessions', 'mfa_codes')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'MFA verified session required') THEN
      EXECUTE format('CREATE POLICY "MFA verified session required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.mfa_session_ok())) WITH CHECK ((SELECT public.mfa_session_ok()))', t);
    END IF;
  END LOOP;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'MFA verified private storage required') THEN
    CREATE POLICY "MFA verified private storage required" ON storage.objects
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (bucket_id NOT IN ('talent-documents', 'agency-compliance-docs', 'agency-branding', 'talent-private-documents', 'database_export_25_08_26', 'talent-invite-docs') OR (SELECT public.mfa_session_ok()))
      WITH CHECK (bucket_id NOT IN ('talent-documents', 'agency-compliance-docs', 'agency-branding', 'talent-private-documents', 'database_export_25_08_26', 'talent-invite-docs') OR (SELECT public.mfa_session_ok()));
  END IF;
END $$;
-- RLS cannot protect SECURITY DEFINER RPCs: guard direct Data API calls too.
CREATE OR REPLACE FUNCTION public.mfa_rest_guard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
    AND COALESCE(current_setting('request.path', true), '') NOT IN (
      '/rpc/mfa_session_ok', '/rpc/my_account_access', '/mfa_settings', '/mfa_verified_sessions', '/mfa_codes'
    )
    AND NOT public.mfa_session_ok() THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'MFA_REQUIRED';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.mfa_rest_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_rest_guard() TO anon, authenticated, service_role;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.mfa_rest_guard';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
-- Rollback (security-reducing; never automatic): ALTER ROLE authenticator RESET pgrst.db_pre_request;
-- DROP FUNCTION public.mfa_rest_guard(); DROP POLICY "MFA verified private storage required" ON storage.objects;
-- For each protected public table: DROP POLICY "MFA verified session required" ON public.<table>;
-- DROP FUNCTION public.mfa_session_ok(); NOTIFY pgrst, 'reload config';
-- Keep additive mfa_codes.session_id and service-only flow writes.
$migration$;
  END IF;
END $history$;
