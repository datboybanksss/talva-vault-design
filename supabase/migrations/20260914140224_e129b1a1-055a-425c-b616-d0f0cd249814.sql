INSERT INTO public.agency_invoice_payments (doc_id, agency_id, amount_cents, paid_on, method, reference, notes, recorded_by)
SELECT d.id, d.agency_id, d.total_cents,
       COALESCE(d.paid_at, d.updated_at, d.created_at)::date,
       'Backfilled — pre-dates payment tracking', NULL, NULL, NULL
FROM public.agency_billing_docs d
WHERE d.kind = 'invoice'
  AND d.status = 'paid'
  AND d.total_cents > 0
  AND NOT EXISTS (SELECT 1 FROM public.agency_invoice_payments p WHERE p.doc_id = d.id);

UPDATE public.agency_billing_docs d
SET paid_at = COALESCE(d.paid_at, (SELECT max(p.paid_on)::timestamptz FROM public.agency_invoice_payments p WHERE p.doc_id = d.id))
WHERE d.kind = 'invoice' AND d.status = 'paid' AND d.paid_at IS NULL;