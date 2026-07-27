DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'test.manager@talvault.com';
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.manager@talvault.com', crypt('TalVault!Test2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Test Manager"}'::jsonb, '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, uid::text, json_build_object('sub', uid::text, 'email', 'test.manager@talvault.com')::jsonb, 'email', now(), now(), now());
  END IF;
  INSERT INTO public.agency_members (user_id, agency_id, role)
  VALUES (uid, '5deb59a4-3c84-44ab-b234-b18e71b1039c', 'owner')
  ON CONFLICT DO NOTHING;
END $$;