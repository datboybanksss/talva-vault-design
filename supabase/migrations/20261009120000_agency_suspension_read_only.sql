-- Agency offboarding (Agency T&C s15): suspended agency staff are read-only for
-- post_end_read_only_years() (one number, also used by talent_post_end_access_years())
-- from agencies.suspended_at, then lose all access. Reinstating restores writes.
-- Already applied to the live database; every statement is idempotent
-- (CREATE OR REPLACE / guarded DO blocks / ALTER POLICY), so re-running is a no-op.
--
-- ROLLBACK (manual):
--   DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename, policyname FROM pg_policies
--     WHERE schemaname='public' AND policyname LIKE 'Suspended agency read-only%'
--     LOOP EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename); END LOOP; END $$;
--   Restore is_agency_member / has_agency_role without "AND public.agency_staff_can_read(_agency_id)".
--   In request_talent_link, resend_link_request, cancel_link_request, mint_billing_doc_number replace
--     agency_staff_can_write(auth.uid(), ...) back with is_agency_member(auth.uid(), ...).
--   Remove the AGENCY_READ_ONLY guard line from provision_talent_folders and reconcile_talent_type_folders.
--   ALTER the six storage policies (talent_docs_insert/update/delete, agency members insert/update/delete
--     own branding) back to is_agency_member(...) in place of agency_staff_can_write(...).
--   CREATE OR REPLACE FUNCTION public.talent_post_end_access_years() RETURNS integer LANGUAGE sql IMMUTABLE AS $f$ SELECT 10 $f$;
--   DROP FUNCTION public.agency_staff_can_write(uuid,uuid), public.agency_staff_write_blocked(uuid,uuid),
--     public.agency_staff_can_read(uuid), public.agency_read_only_until(uuid), public.agency_is_writable(uuid),
--     public.post_end_read_only_years();

-- Agency offboarding: suspended agencies are read-only for staff for the shared
-- post-end window (one number), then staff lose all access. Reinstating clears it.

-- 1. One number for every post-end read-only window.
CREATE OR REPLACE FUNCTION public.post_end_read_only_years()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT 10 $$;

CREATE OR REPLACE FUNCTION public.talent_post_end_access_years()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT public.post_end_read_only_years() $$;

-- 2. Agency state helpers.
CREATE OR REPLACE FUNCTION public.agency_is_writable(_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = _agency_id AND a.status = 'suspended');
$$;

CREATE OR REPLACE FUNCTION public.agency_read_only_until(_agency_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(a.suspended_at, now()) + make_interval(years => public.post_end_read_only_years())
    FROM public.agencies a WHERE a.id = _agency_id AND a.status = 'suspended';
$$;

CREATE OR REPLACE FUNCTION public.agency_staff_can_read(_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(public.agency_read_only_until(_agency_id) > now(), true);
$$;

-- Membership now honours the read-only window: after it, staff have no access.
CREATE OR REPLACE FUNCTION public.is_agency_member(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE user_id = _user_id AND agency_id = _agency_id AND suspended = false
  ) AND public.agency_staff_can_read(_agency_id);
$$;

CREATE OR REPLACE FUNCTION public.has_agency_role(_user_id uuid, _agency_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE user_id = _user_id AND agency_id = _agency_id AND role = _role AND suspended = false
  ) AND public.agency_staff_can_read(_agency_id);
$$;

-- True when _user_id is staff of a suspended agency (blocks every staff write).
CREATE OR REPLACE FUNCTION public.agency_staff_write_blocked(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND _agency_id IS NOT NULL
     AND NOT public.agency_is_writable(_agency_id)
     AND EXISTS (SELECT 1 FROM public.agency_members m
                  WHERE m.user_id = _user_id AND m.agency_id = _agency_id);
$$;

CREATE OR REPLACE FUNCTION public.agency_staff_can_write(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_agency_member(_user_id, _agency_id) AND public.agency_is_writable(_agency_id);
$$;

REVOKE EXECUTE ON FUNCTION public.agency_is_writable(uuid), public.agency_read_only_until(uuid),
  public.agency_staff_can_read(uuid), public.agency_staff_write_blocked(uuid, uuid),
  public.agency_staff_can_write(uuid, uuid), public.post_end_read_only_years() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_is_writable(uuid), public.agency_read_only_until(uuid),
  public.agency_staff_can_read(uuid), public.agency_staff_write_blocked(uuid, uuid),
  public.agency_staff_can_write(uuid, uuid), public.post_end_read_only_years() TO authenticated, service_role;

-- 3. Restrictive write policies (AND-ed with existing ones). Admins and talent
--    are not agency staff, so they are unaffected.
DO $$
DECLARE t text; op text; expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_billing_counters','agency_billing_docs','agency_clients',
    'agency_compliance_documents','agency_document_request_history','agency_document_requests',
    'agency_documents','agency_folder_settings','agency_folder_subfolder_settings',
    'agency_folder_templates','agency_invitations','agency_invoice_payments','agency_members',
    'agency_retention_rules','agency_talent_folders','agency_talent_links','talent_invitations',
    'talent_shared_documents','agencies','agency_billing_doc_lines','agency_folder_template_items',
    'talent_invitation_documents','talent_shared_document_versions']
  LOOP
    expr := CASE t
      WHEN 'agencies' THEN 'public.agency_staff_write_blocked(auth.uid(), id)'
      WHEN 'agency_billing_doc_lines' THEN 'public.agency_staff_write_blocked(auth.uid(), (SELECT d.agency_id FROM public.agency_billing_docs d WHERE d.id = doc_id))'
      WHEN 'agency_folder_template_items' THEN 'public.agency_staff_write_blocked(auth.uid(), (SELECT x.agency_id FROM public.agency_folder_templates x WHERE x.id = template_id))'
      WHEN 'talent_invitation_documents' THEN 'public.agency_staff_write_blocked(auth.uid(), (SELECT x.agency_id FROM public.talent_invitations x WHERE x.id = invitation_id))'
      WHEN 'talent_shared_document_versions' THEN 'public.agency_staff_write_blocked(auth.uid(), (SELECT x.agency_id FROM public.talent_shared_documents x WHERE x.id = document_id))'
      ELSE 'public.agency_staff_write_blocked(auth.uid(), agency_id)' END;
    FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
                     AND policyname = 'Suspended agency read-only ' || lower(op)) THEN
        IF op = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT %s)', 'Suspended agency read-only insert', t, expr);
        ELSIF op = 'UPDATE' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT %s) WITH CHECK (NOT %s)', 'Suspended agency read-only update', t, expr, expr);
        ELSE
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT %s)', 'Suspended agency read-only delete', t, expr);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 4. Storage writes for agency buckets.
ALTER POLICY talent_docs_insert ON storage.objects WITH CHECK ((bucket_id = 'talent-documents') AND public.agency_staff_can_write(auth.uid(), ((storage.foldername(name))[1])::uuid));
ALTER POLICY talent_docs_update ON storage.objects USING ((bucket_id = 'talent-documents') AND public.agency_staff_can_write(auth.uid(), ((storage.foldername(name))[1])::uuid)) WITH CHECK ((bucket_id = 'talent-documents') AND public.agency_staff_can_write(auth.uid(), ((storage.foldername(name))[1])::uuid));
ALTER POLICY talent_docs_delete ON storage.objects USING ((bucket_id = 'talent-documents') AND public.agency_staff_can_write(auth.uid(), ((storage.foldername(name))[1])::uuid));
ALTER POLICY "agency members insert own branding" ON storage.objects WITH CHECK ((bucket_id = 'agency-branding') AND public.agency_staff_can_write(auth.uid(), (split_part(name, '/', 1))::uuid));
ALTER POLICY "agency members update own branding" ON storage.objects USING ((bucket_id = 'agency-branding') AND public.agency_staff_can_write(auth.uid(), (split_part(name, '/', 1))::uuid));
ALTER POLICY "agency members delete own branding" ON storage.objects USING ((bucket_id = 'agency-branding') AND public.agency_staff_can_write(auth.uid(), (split_part(name, '/', 1))::uuid));

-- 5. Security-definer write functions called by agency staff.
DO $$
DECLARE f text; def text; newdef text;
BEGIN
  FOREACH f IN ARRAY ARRAY['request_talent_link','resend_link_request','cancel_link_request','mint_billing_doc_number'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    newdef := replace(replace(def, 'NOT public.is_agency_member(auth.uid(), l.agency_id)', 'NOT public.agency_staff_can_write(auth.uid(), l.agency_id)'),
                      'NOT public.is_agency_member(auth.uid(), _agency_id)', 'NOT public.agency_staff_can_write(auth.uid(), _agency_id)');
    newdef := replace(newdef, 'IF NOT (public.is_agency_member(auth.uid(), _agency_id)', 'IF NOT (public.agency_staff_can_write(auth.uid(), _agency_id)');
    IF newdef <> def THEN EXECUTE newdef; END IF;
  END LOOP;

  SELECT pg_get_functiondef('public.provision_talent_folders(uuid,uuid,text[],text)'::regprocedure) INTO def;
  IF position('agency_staff_write_blocked' in def) = 0 THEN
    EXECUTE regexp_replace(def, E'\\nBEGIN\\n', E'\nBEGIN\n  IF public.agency_staff_write_blocked(auth.uid(), _agency_id) THEN RAISE EXCEPTION ''AGENCY_READ_ONLY''; END IF;\n');
  END IF;
  SELECT pg_get_functiondef('public.reconcile_talent_type_folders(uuid,text)'::regprocedure) INTO def;
  IF position('agency_staff_write_blocked' in def) = 0 THEN
    EXECUTE replace(def, 'IF ag IS NULL THEN RETURN 0; END IF;', 'IF ag IS NULL THEN RETURN 0; END IF;
  IF public.agency_staff_write_blocked(auth.uid(), ag) THEN RAISE EXCEPTION ''AGENCY_READ_ONLY''; END IF;');
  END IF;
END $$;
