
-- M6: contract metadata on shared documents
ALTER TABLE public.talent_shared_documents
  ADD COLUMN IF NOT EXISTS contract_client_name text,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS contract_total_cents bigint,
  ADD COLUMN IF NOT EXISTS contract_currency text,
  ADD COLUMN IF NOT EXISTS contract_notes text;

ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS contract_document_id uuid REFERENCES public.talent_shared_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billing_contract ON public.agency_billing_docs(contract_document_id);

-- M4: document requests
DO $$ BEGIN
  CREATE TYPE public.doc_request_status AS ENUM ('pending','submitted','completed','resubmission_required','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.agency_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_link_id uuid NOT NULL REFERENCES public.agency_talent_links(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  title text NOT NULL,
  folder text NOT NULL,
  instructions text,
  status public.doc_request_status NOT NULL DEFAULT 'pending',
  due_date date,
  current_document_id uuid REFERENCES public.talent_shared_documents(id) ON DELETE SET NULL,
  reason_code text,
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_document_requests TO authenticated;
GRANT ALL ON public.agency_document_requests TO service_role;
ALTER TABLE public.agency_document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read requests"
  ON public.agency_document_requests FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members write requests"
  ON public.agency_document_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members update requests"
  ON public.agency_document_requests FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members delete requests"
  ON public.agency_document_requests FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE TRIGGER agency_document_requests_touch
  BEFORE UPDATE ON public.agency_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_doc_req_agency ON public.agency_document_requests(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_req_talent ON public.agency_document_requests(talent_link_id);
CREATE INDEX IF NOT EXISTS idx_doc_req_status ON public.agency_document_requests(agency_id, status);

-- History: submissions are retained forever
CREATE TABLE IF NOT EXISTS public.agency_document_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.agency_document_requests(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  event text NOT NULL, -- 'submitted','completed','resubmission_required','cancelled','note'
  document_id uuid REFERENCES public.talent_shared_documents(id) ON DELETE SET NULL,
  reason_code text,
  notes text,
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agency_document_request_history TO authenticated;
GRANT ALL ON public.agency_document_request_history TO service_role;
ALTER TABLE public.agency_document_request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read request history"
  ON public.agency_document_request_history FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members write request history"
  ON public.agency_document_request_history FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE INDEX IF NOT EXISTS idx_doc_req_hist_req ON public.agency_document_request_history(request_id, created_at DESC);
