-- Copied from drizzle/migrations/0014_portal_access_and_staged_onboarding_uploads.sql (already applied). Idempotent: CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS.
-- Rollback: DROP FUNCTION public.queue_stale_onboarding_uploads(timestamptz); DROP TABLE public.onboarding_staged_uploads; DROP FUNCTION public.my_portal_access();
CREATE OR REPLACE FUNCTION public.my_portal_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); is_admin boolean; ag uuid; is_agency boolean := false; is_talent boolean; readable boolean;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('signed_in', false); END IF;
  readable := public.account_read_allowed(uid);
  is_admin := public.has_role(uid, 'admin');
  SELECT agency_id INTO ag FROM public.agency_members WHERE user_id = uid AND suspended = false ORDER BY created_at LIMIT 1;
  IF ag IS NOT NULL AND readable THEN is_agency := public.is_agency_member(uid, ag); END IF;
  is_talent := readable AND EXISTS (SELECT 1 FROM public.talent_profiles WHERE user_id = uid);
  RETURN jsonb_build_object(
    'signed_in', true, 'user_id', uid, 'paused', public.account_paused(uid),
    'admin', is_admin, 'agency', is_agency, 'talent', is_talent,
    'home', CASE WHEN is_admin THEN '/admin' WHEN is_agency THEN '/agency' WHEN is_talent THEN '/talent' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.my_portal_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_portal_access() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.onboarding_staged_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  session_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('agency','talent')),
  doc_slot text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint,
  validated_at timestamptz,
  quarantine_reason text CHECK (quarantine_reason IS NULL OR (quarantine_reason IN ('blocked_type','failed_check') AND validated_at IS NULL)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS onboarding_staged_uploads_owner_idx ON public.onboarding_staged_uploads (admin_id, session_id);
CREATE INDEX IF NOT EXISTS onboarding_staged_uploads_created_idx ON public.onboarding_staged_uploads (created_at);
GRANT SELECT ON public.onboarding_staged_uploads TO authenticated;
GRANT ALL ON public.onboarding_staged_uploads TO service_role;
ALTER TABLE public.onboarding_staged_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read own staged uploads" ON public.onboarding_staged_uploads;
CREATE POLICY "Admins read own staged uploads" ON public.onboarding_staged_uploads FOR SELECT TO authenticated
  USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));
COMMENT ON TABLE public.onboarding_staged_uploads IS 'Admin onboarding files uploaded before the invitation exists; written only by the service role, attached on Save draft, purged after 24 hours.';

CREATE OR REPLACE FUNCTION public.queue_stale_onboarding_uploads(_cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE removed integer; BEGIN
  WITH gone AS (DELETE FROM public.onboarding_staged_uploads WHERE created_at < LEAST(_cutoff, now() - interval '24 hours') RETURNING kind, storage_path),
  queued AS (INSERT INTO public.document_storage_purge_queue(bucket, path)
    SELECT CASE kind WHEN 'agency' THEN 'agency-compliance-docs' ELSE 'talent-invite-docs' END, storage_path FROM gone
    WHERE NOT EXISTS (SELECT 1 FROM public.talent_invitation_documents d WHERE d.storage_path = gone.storage_path)
      AND NOT EXISTS (SELECT 1 FROM public.agency_compliance_documents d WHERE d.storage_path = gone.storage_path)
    RETURNING id)
  SELECT count(*) INTO removed FROM queued; RETURN removed; END $$;
REVOKE ALL ON FUNCTION public.queue_stale_onboarding_uploads(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_stale_onboarding_uploads(timestamptz) TO service_role;