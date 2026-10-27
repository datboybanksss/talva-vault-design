-- Self-check for two-step enforcement. Always rolls back (final RAISE), so the
-- switch and all data are left exactly as they were. Run with an owner role.
-- Expected: off_ok=true on_unverified_ok=false on_profiles=0 on_objects=0
-- nonadmin_switch_rows=0 verifiedA_ok=true sessB_ok=false nosession_ok=false
-- audit_rows=1 anon=denied
DO $$
DECLARE u uuid; r text := ''; n int;
BEGIN
  SELECT id INTO u FROM public.profiles LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','session_id','sess-A')::text, true);
  SET LOCAL ROLE authenticated;
  r := r || 'off_ok=' || public.mfa_session_ok();
  SELECT count(*) INTO n FROM public.profiles; r := r || ' off_profiles=' || n;
  RESET ROLE;
  UPDATE public.platform_settings SET value='true' WHERE key='mfa_enforced';
  SET LOCAL ROLE authenticated;
  r := r || ' on_unverified_ok=' || public.mfa_session_ok();
  SELECT count(*) INTO n FROM public.profiles; r := r || ' on_profiles=' || n;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='talent-private-documents'; r := r || ' on_objects=' || n;
  BEGIN UPDATE public.platform_settings SET value='false' WHERE key='mfa_enforced'; GET DIAGNOSTICS n = ROW_COUNT; r := r || ' nonadmin_switch_rows=' || n;
  EXCEPTION WHEN others THEN r := r || ' nonadmin_switch=denied'; END;
  RESET ROLE;
  INSERT INTO public.mfa_verified_sessions(user_id, session_id, verified_at) VALUES (u,'sess-A',now());
  SET LOCAL ROLE authenticated;
  r := r || ' verifiedA_ok=' || public.mfa_session_ok();
  SELECT count(*) INTO n FROM public.profiles; r := r || ' verifiedA_profiles=' || n;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','session_id','sess-B')::text, true);
  r := r || ' sessB_ok=' || public.mfa_session_ok();
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  r := r || ' nosession_ok=' || public.mfa_session_ok();
  RESET ROLE;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE action='mfa_enforcement_changed' AND created_at > now() - interval '1 minute'; r := r || ' audit_rows=' || n;
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.mfa_session_ok(); r := r || ' anon=allowed'; EXCEPTION WHEN insufficient_privilege THEN r := r || ' anon=denied'; END;
  RESET ROLE;
  RAISE EXCEPTION 'ROLLBACK_REPORT %', r;
END $$;
