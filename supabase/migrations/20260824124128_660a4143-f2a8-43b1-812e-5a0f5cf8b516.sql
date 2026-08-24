-- TVA-SEC-001 remediation.
--
-- The earlier migration 20260727193209 embedded a literal password for
-- test.manager@talvault.com directly in SQL. That account's password has been
-- rotated out-of-band to a random secret via the Auth Admin API; the account
-- itself is retained because it owns real agency-owner membership and uploaded
-- documents.
--
-- Migration history cannot be rewritten after the fact, so this migration
-- replaces the *pattern*: any future seed account must be created through the
-- helper below, which requires an operator-supplied secret at call time and
-- fails loudly when one is absent.

CREATE OR REPLACE FUNCTION public.seed_agency_owner_account(
  _email text,
  _agency_id uuid,
  _password text DEFAULT NULL,
  _full_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
BEGIN
  IF _email IS NULL OR btrim(_email) = '' THEN
    RAISE EXCEPTION 'SEED_ABORTED: _email is required';
  END IF;
  IF _agency_id IS NULL THEN
    RAISE EXCEPTION 'SEED_ABORTED: _agency_id is required';
  END IF;

  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(_email);

  IF uid IS NULL THEN
    -- No literal password may ever live in SQL. The operator must pass one in
    -- from their environment, e.g.
    --   psql "$SUPABASE_DB_URL" -v pw="$SEED_ACCOUNT_PASSWORD" \
    --     -c "select public.seed_agency_owner_account('x@y.z','<agency-uuid>', :'pw');"
    IF _password IS NULL OR btrim(_password) = '' THEN
      RAISE EXCEPTION
        'SEED_ABORTED: no password supplied. Set SEED_ACCOUNT_PASSWORD in the operator environment and pass it as _password; passwords must never be written into migration SQL.';
    END IF;

    IF length(_password) < 16 THEN
      RAISE EXCEPTION 'SEED_ABORTED: supplied password is shorter than 16 characters';
    END IF;

    -- Defence in depth: the credential leaked in migration 20260727193209 is
    -- permanently blacklisted and can never be re-established.
    IF _password = 'TalVault!Test2026' THEN
      RAISE EXCEPTION 'SEED_ABORTED: that password is publicly known and is permanently blocked';
    END IF;

    uid := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
      uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      lower(_email), crypt(_password, gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', COALESCE(_full_name, _email)),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', lower(_email)),
      'email', now(), now(), now()
    );

    INSERT INTO public.admin_audit_log
      (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES
      (uid, lower(_email), 'seed_account_created', 'auth_user', uid::text, lower(_email),
       jsonb_build_object('agency_id', _agency_id, 'source', 'seed_agency_owner_account'));
  END IF;

  INSERT INTO public.agency_members (user_id, agency_id, role)
  VALUES (uid, _agency_id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN uid;
END;
$function$;

-- Seeding is an operator/back-office action only. No app role may call it.
REVOKE ALL ON FUNCTION public.seed_agency_owner_account(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_agency_owner_account(text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.seed_agency_owner_account(text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_agency_owner_account(text, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.seed_agency_owner_account(text, uuid, text, text) IS
  'Operator-only seed helper. Requires an operator-supplied password at call time (from the environment); raises SEED_ABORTED when absent, too short, or equal to the credential leaked in migration 20260727193209. Replaces the hardcoded-credential pattern flagged as TVA-SEC-001.';