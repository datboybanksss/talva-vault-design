CREATE TABLE public.agency_invoice_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_id uuid NOT NULL REFERENCES public.agency_billing_docs(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  reference text,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_payments_doc ON public.agency_invoice_payments(doc_id);
CREATE INDEX idx_invoice_payments_agency_paid_on ON public.agency_invoice_payments(agency_id, paid_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_invoice_payments TO authenticated;
GRANT ALL ON public.agency_invoice_payments TO service_role;

ALTER TABLE public.agency_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read own invoice payments"
  ON public.agency_invoice_payments FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agency members insert own invoice payments"
  ON public.agency_invoice_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members update own invoice payments"
  ON public.agency_invoice_payments FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members delete own invoice payments"
  ON public.agency_invoice_payments FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE TRIGGER agency_invoice_payments_touch
  BEFORE UPDATE ON public.agency_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.recompute_invoice_payment_status(_doc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d RECORD;
  received bigint;
  last_paid date;
BEGIN
  SELECT * INTO d FROM public.agency_billing_docs WHERE id = _doc_id;
  IF d.id IS NULL OR d.kind <> 'invoice' THEN RETURN; END IF;
  IF d.status IN ('draft', 'cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount_cents), 0), MAX(paid_on)
    INTO received, last_paid
    FROM public.agency_invoice_payments WHERE doc_id = _doc_id;

  IF received >= d.total_cents AND d.total_cents > 0 THEN
    UPDATE public.agency_billing_docs
       SET status = 'paid',
           paid_at = COALESCE(last_paid::timestamptz, now())
     WHERE id = _doc_id;
  ELSE
    UPDATE public.agency_billing_docs
       SET status = CASE
             WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'overdue'::doc_status
             ELSE 'sent'::doc_status
           END,
           paid_at = NULL
     WHERE id = _doc_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_payments_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recompute_invoice_payment_status(COALESCE(NEW.doc_id, OLD.doc_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER agency_invoice_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.agency_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.invoice_payments_sync_status();