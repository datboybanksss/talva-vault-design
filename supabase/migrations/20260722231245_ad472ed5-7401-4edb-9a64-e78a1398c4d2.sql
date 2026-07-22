
-- Extend invitation status enum with draft
ALTER TYPE public.invitation_status ADD VALUE IF NOT EXISTS 'draft';

-- Phone-number fields on agency_invitations
ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS registered_contact_number text,
  ADD COLUMN IF NOT EXISTS registered_mobile_number text;

-- Compliance documents table
CREATE TABLE IF NOT EXISTS public.agency_compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.agency_invitations(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  business_type text NOT NULL CHECK (business_type IN ('formal','informal')),
  doc_slot text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acd_invitation ON public.agency_compliance_documents(invitation_id);
CREATE INDEX IF NOT EXISTS idx_acd_agency ON public.agency_compliance_documents(agency_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_compliance_documents TO authenticated;
GRANT ALL ON public.agency_compliance_documents TO service_role;

ALTER TABLE public.agency_compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view compliance docs"
  ON public.agency_compliance_documents FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert compliance docs"
  ON public.agency_compliance_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete compliance docs"
  ON public.agency_compliance_documents FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
