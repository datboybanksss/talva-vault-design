CREATE TABLE public.agency_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  emails text[] NOT NULL DEFAULT '{}'::text[],
  phone text,
  address text,
  vat_number text,
  city text,
  country text,
  notes text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_clients TO authenticated;
GRANT ALL ON public.agency_clients TO service_role;

ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view their clients"
  ON public.agency_clients FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members can add clients"
  ON public.agency_clients FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members can update their clients"
  ON public.agency_clients FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members can remove their clients"
  ON public.agency_clients FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE INDEX agency_clients_agency_idx ON public.agency_clients (agency_id, archived_at, name);

CREATE TRIGGER agency_clients_touch_updated_at
  BEFORE UPDATE ON public.agency_clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.agency_billing_docs
  ADD COLUMN client_id uuid REFERENCES public.agency_clients(id) ON DELETE SET NULL,
  ADD COLUMN recipient_contact_person text;