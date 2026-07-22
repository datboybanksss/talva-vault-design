
ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS business_type text
  CHECK (business_type IN ('formal','informal'));

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS business_type text
  CHECK (business_type IN ('formal','informal'));
