ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS allow_partial_payment boolean NOT NULL DEFAULT false;