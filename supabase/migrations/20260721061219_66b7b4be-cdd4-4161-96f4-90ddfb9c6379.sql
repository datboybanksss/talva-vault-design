
ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS shared_with_talent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_from_quote_id uuid NULL REFERENCES public.agency_billing_docs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agency_billing_docs_converted_from_idx
  ON public.agency_billing_docs(converted_from_quote_id);
