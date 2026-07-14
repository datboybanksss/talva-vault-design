
-- Agency-scoped audit log
CREATE TABLE public.agency_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_label text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agency_audit_log TO authenticated;
GRANT ALL ON public.agency_audit_log TO service_role;
ALTER TABLE public.agency_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency members read own audit"
  ON public.agency_audit_log FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members insert own audit"
  ON public.agency_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE INDEX agency_audit_log_agency_created_idx
  ON public.agency_audit_log (agency_id, created_at DESC);

-- Agency owners manage their agency's Staff invitations
CREATE POLICY "Agency owners manage staff invitations"
  ON public.agency_invitations FOR ALL TO authenticated
  USING (kind = 'staff' AND agency_id IS NOT NULL
         AND public.has_agency_role(auth.uid(), agency_id, 'owner'))
  WITH CHECK (kind = 'staff' AND agency_id IS NOT NULL
              AND public.has_agency_role(auth.uid(), agency_id, 'owner'));

-- Agency members read talent invitations for their agency
CREATE POLICY "Agency members read talent invitations"
  ON public.talent_invitations FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

-- Agency owners manage talent invitations for their agency
CREATE POLICY "Agency owners manage talent invitations"
  ON public.talent_invitations FOR ALL TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'))
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));
