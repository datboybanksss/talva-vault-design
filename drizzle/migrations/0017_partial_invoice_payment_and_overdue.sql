CREATE OR REPLACE FUNCTION public.recompute_invoice_payment_status(_doc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d RECORD; received bigint; last_paid date;
BEGIN
 SELECT * INTO d FROM public.agency_billing_docs WHERE id = _doc_id;
 IF d.id IS NULL OR d.kind <> 'invoice' THEN RETURN; END IF;
 IF d.status IN ('draft', 'cancelled') THEN RETURN; END IF;
 SELECT COALESCE(SUM(amount_cents), 0), MAX(paid_on) INTO received, last_paid FROM public.agency_invoice_payments WHERE doc_id = _doc_id;
 IF received >= d.total_cents AND d.total_cents > 0 THEN
  UPDATE public.agency_billing_docs SET status = 'paid', paid_at = COALESCE(last_paid::timestamptz, now()) WHERE id = _doc_id;
 ELSE
  UPDATE public.agency_billing_docs SET status = CASE WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'overdue'::public.doc_status WHEN received > 0 THEN 'partial'::public.doc_status ELSE 'sent'::public.doc_status END, paid_at = NULL WHERE id = _doc_id;
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.sweep_overdue_invoices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
 UPDATE public.agency_billing_docs d SET status = 'overdue'
 WHERE d.kind = 'invoice' AND d.status IN ('sent', 'accepted', 'partial') AND d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE AND d.total_cents > COALESCE((SELECT SUM(p.amount_cents) FROM public.agency_invoice_payments p WHERE p.doc_id = d.id), 0);
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END; $$;