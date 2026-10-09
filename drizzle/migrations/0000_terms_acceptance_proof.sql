-- 1. Document hash
ALTER TABLE public.legal_documents ADD COLUMN IF NOT EXISTS body_sha256 text;

CREATE OR REPLACE FUNCTION public.legal_documents_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.legal_acceptances a WHERE a.document_id = OLD.id) THEN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.doc_type IS DISTINCT FROM OLD.doc_type THEN
      RAISE EXCEPTION 'LEGAL_DOCUMENT_LOCKED: this Terms version has been accepted; publish a new version instead'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.body_sha256 := encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS legal_documents_guard ON public.legal_documents;
CREATE TRIGGER legal_documents_guard BEFORE INSERT OR UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.legal_documents_guard();

UPDATE public.legal_documents SET body_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex') WHERE body_sha256 IS NULL;
ALTER TABLE public.legal_documents ALTER COLUMN body_sha256 SET NOT NULL;

-- 2. Acceptance stamp columns
ALTER TABLE public.legal_acceptances
  ADD COLUMN IF NOT EXISTS body_sha256 text,
  ADD COLUMN IF NOT EXISTS hash_retrospective boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS user_full_name text,
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS agency_id uuid,
  ADD COLUMN IF NOT EXISTS acceptance_method text,
  ADD COLUMN IF NOT EXISTS proof_ref text;

ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_user_role_check;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_user_role_check
  CHECK (user_role IS NULL OR user_role IN ('talent','agency_owner','agency_staff'));
ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_method_check;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_method_check
  CHECK (acceptance_method IS NULL OR acceptance_method IN ('activation','reacceptance'));

-- Records outlive account deletion (proof must survive); documents cannot be deleted once accepted.
ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_user_id_fkey;
ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_document_id_fkey;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.legal_documents(id) ON DELETE RESTRICT;

-- 3. Backfill the existing rows (hash added retrospectively; uncaptured fields stay null)
UPDATE public.legal_acceptances a
   SET body_sha256 = d.body_sha256,
       hash_retrospective = true,
       proof_ref = 'TV-' || upper(substr(replace(a.id::text,'-',''),1,8)) || '-' || upper(substr(d.body_sha256,1,8))
  FROM public.legal_documents d
 WHERE d.id = a.document_id AND a.body_sha256 IS NULL;

-- 4. Server-side stamp on insert: never trusts the caller for identity, hash or time
CREATE OR REPLACE FUNCTION public.legal_acceptances_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; m record;
BEGIN
  IF NEW.document_id IS NULL THEN RAISE EXCEPTION 'document_id is required'; END IF;
  SELECT id, doc_type, version, body_sha256 INTO d FROM public.legal_documents WHERE id = NEW.document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown legal document'; END IF;
  IF NEW.acceptance_method IS NULL THEN RAISE EXCEPTION 'acceptance_method is required'; END IF;
  NEW.doc_type := d.doc_type;
  NEW.version := d.version;
  NEW.body_sha256 := d.body_sha256;
  NEW.hash_retrospective := false;
  NEW.accepted_at := now();
  NEW.created_at := now();
  SELECT u.email INTO NEW.user_email FROM auth.users u WHERE u.id = NEW.user_id;
  IF d.doc_type = 'talent' THEN
    NEW.user_role := 'talent';
    NEW.agency_id := NULL;
    SELECT coalesce(nullif(tp.full_name,''), nullif(p.display_name,''))
      INTO NEW.user_full_name
      FROM public.profiles p LEFT JOIN public.talent_profiles tp ON tp.user_id = p.id
     WHERE p.id = NEW.user_id LIMIT 1;
  ELSE
    SELECT am.agency_id, am.role INTO m FROM public.agency_members am
     WHERE am.user_id = NEW.user_id ORDER BY (am.role = 'owner') DESC, am.created_at LIMIT 1;
    NEW.agency_id := m.agency_id;
    NEW.user_role := CASE WHEN m.role = 'owner' THEN 'agency_owner' WHEN m.role IS NULL THEN NULL ELSE 'agency_staff' END;
    SELECT nullif(p.display_name,'') INTO NEW.user_full_name FROM public.profiles p WHERE p.id = NEW.user_id;
  END IF;
  IF NEW.user_full_name IS NULL THEN
    SELECT nullif(u.raw_user_meta_data->>'display_name','') INTO NEW.user_full_name FROM auth.users u WHERE u.id = NEW.user_id;
  END IF;
  NEW.proof_ref := 'TV-' || upper(substr(replace(NEW.id::text,'-',''),1,8)) || '-' || upper(substr(d.body_sha256,1,8));
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.legal_acceptances_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS legal_acceptances_stamp ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_stamp BEFORE INSERT ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.legal_acceptances_stamp();

-- 5. Append-only
CREATE OR REPLACE FUNCTION public.legal_acceptances_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'LEGAL_ACCEPTANCE_IMMUTABLE: Terms acceptance records cannot be changed or deleted'
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS legal_acceptances_no_update_delete ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_no_update_delete BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.legal_acceptances_append_only();
DROP TRIGGER IF EXISTS legal_acceptances_no_truncate ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_no_truncate BEFORE TRUNCATE ON public.legal_acceptances
  FOR EACH STATEMENT EXECUTE FUNCTION public.legal_acceptances_append_only();

REVOKE UPDATE, DELETE, TRUNCATE ON public.legal_acceptances FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS "Acceptances are append-only (no update)" ON public.legal_acceptances;
CREATE POLICY "Acceptances are append-only (no update)" ON public.legal_acceptances
  AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Acceptances are append-only (no delete)" ON public.legal_acceptances;
CREATE POLICY "Acceptances are append-only (no delete)" ON public.legal_acceptances
  AS RESTRICTIVE FOR DELETE TO public USING (false);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON public.legal_acceptances(user_id, doc_type);