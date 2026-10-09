-- Terms acceptance enforced in the database (defence in depth behind the
-- server-function checks). Talent and agency staff without an acceptance of
-- the current Terms for their role cannot INSERT/UPDATE/DELETE portal rows or
-- portal storage files. Admins are exempt. Reads are unchanged.
-- Guarded: CREATE OR REPLACE + IF NOT EXISTS checks, so re-running is a no-op.
--
-- ROLLBACK (run manually if ever needed):
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
--       WHERE policyname LIKE 'Terms not accepted%'
--     LOOP EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename); END LOOP; END $$;
--   DROP FUNCTION IF EXISTS public.terms_write_allowed(uuid);
--   DROP FUNCTION IF EXISTS public.has_accepted_current_terms(uuid, text);

CREATE OR REPLACE FUNCTION public.has_accepted_current_terms(_user_id uuid, _doc_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.legal_documents d
                     WHERE d.doc_type = _doc_type AND d.is_current) THEN true
    ELSE EXISTS (SELECT 1 FROM public.legal_acceptances a
                 JOIN public.legal_documents d ON d.id = a.document_id
                 WHERE a.user_id = _user_id AND d.doc_type = _doc_type AND d.is_current)
  END;
$$;

CREATE OR REPLACE FUNCTION public.terms_write_allowed(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin') OR (
      (NOT EXISTS (SELECT 1 FROM public.talent_profiles t WHERE t.user_id = _user_id AND t.deleted_at IS NULL)
        OR public.has_accepted_current_terms(_user_id, 'talent'))
      AND
      (NOT EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = _user_id)
        OR public.has_accepted_current_terms(_user_id, 'agency'))
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_accepted_current_terms(uuid, text), public.terms_write_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_accepted_current_terms(uuid, text), public.terms_write_allowed(uuid) TO authenticated, service_role;

DO $$
DECLARE t text; op text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_billing_counters','agency_billing_docs','agency_clients',
    'agency_compliance_documents','agency_document_request_history','agency_document_requests',
    'agency_documents','agency_folder_settings','agency_folder_subfolder_settings',
    'agency_folder_templates','agency_invitations','agency_invoice_payments','agency_members',
    'agency_retention_rules','agency_talent_folders','agency_talent_links','talent_invitations',
    'talent_shared_documents','agencies','agency_billing_doc_lines','agency_folder_template_items',
    'talent_invitation_documents','talent_shared_document_versions',
    'talent_private_documents','talent_private_folders','loved_one_shares','talent_profiles']
  LOOP
    FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
                     AND policyname = 'Terms not accepted ' || lower(op)) THEN
        IF op = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.terms_write_allowed(auth.uid()))', 'Terms not accepted insert', t);
        ELSIF op = 'UPDATE' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.terms_write_allowed(auth.uid())) WITH CHECK (public.terms_write_allowed(auth.uid()))', 'Terms not accepted update', t);
        ELSE
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.terms_write_allowed(auth.uid()))', 'Terms not accepted delete', t);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Terms not accepted storage insert') THEN
    CREATE POLICY "Terms not accepted storage insert" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id NOT IN ('talent-documents','agency-branding','talent-private-documents') OR public.terms_write_allowed(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Terms not accepted storage update') THEN
    CREATE POLICY "Terms not accepted storage update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (bucket_id NOT IN ('talent-documents','agency-branding','talent-private-documents') OR public.terms_write_allowed(auth.uid()))
      WITH CHECK (bucket_id NOT IN ('talent-documents','agency-branding','talent-private-documents') OR public.terms_write_allowed(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Terms not accepted storage delete') THEN
    CREATE POLICY "Terms not accepted storage delete" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
      USING (bucket_id NOT IN ('talent-documents','agency-branding','talent-private-documents') OR public.terms_write_allowed(auth.uid()));
  END IF;
END $$;