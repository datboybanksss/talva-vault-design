DO $$
DECLARE t text;
  exempt text[] := ARRAY['mfa_codes','mfa_settings','mfa_verified_sessions',
    'folder_catalogue_categories','folder_catalogue_subfolders','folder_type_template_items',
    'talent_vault_catalogue_categories','talent_vault_catalogue_subfolders',
    'legal_documents','legal_copy_items'];
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity AND NOT (tablename = ANY(exempt)) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Two-step verification required" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Two-step verification required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_session_ok()) WITH CHECK (public.mfa_session_ok())', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Two-step verification required" ON storage.objects;
CREATE POLICY "Two-step verification required" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id NOT IN ('talent-documents','agency-compliance-docs','agency-branding','talent-private-documents','talent-invite-docs') OR public.mfa_session_ok())
  WITH CHECK (bucket_id NOT IN ('talent-documents','agency-compliance-docs','agency-branding','talent-private-documents','talent-invite-docs') OR public.mfa_session_ok());