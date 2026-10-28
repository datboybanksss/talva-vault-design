-- Invoice numbers remain used for every invoice, including any deleted records.
-- Rollback: DROP INDEX IF EXISTS public.agency_billing_docs_invoice_number_unique;
-- Restore the previous mint_billing_doc_number implementation shown below if rolling back minting.
CREATE UNIQUE INDEX IF NOT EXISTS agency_billing_docs_invoice_number_unique
ON public.agency_billing_docs (agency_id, lower(btrim(number)))
WHERE kind = 'invoice';

CREATE OR REPLACE FUNCTION public.mint_billing_doc_number(_agency_id uuid, _kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  y int := EXTRACT(YEAR FROM now())::int;
  n int;
  prefix text;
  candidate text;
BEGIN
  IF _kind NOT IN ('quote','invoice') THEN
    RAISE EXCEPTION 'invalid kind: %', _kind;
  END IF;
  IF NOT (public.agency_staff_can_write(auth.uid(), _agency_id)
          OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  prefix := CASE _kind WHEN 'invoice' THEN 'INV' ELSE 'QT' END;
  LOOP
    INSERT INTO public.agency_billing_counters (agency_id, kind, year, next_value)
    VALUES (_agency_id, _kind, y, 2)
    ON CONFLICT (agency_id, kind, year)
    DO UPDATE SET next_value = public.agency_billing_counters.next_value + 1,
                  updated_at = now()
    RETURNING next_value - 1 INTO n;

    -- lpad truncates values longer than its width; invoice counters must not wrap at 10,000.
    candidate := prefix || '-' || y::text || '-' ||
      lpad(n::text, CASE WHEN _kind = 'invoice' THEN greatest(4, length(n::text)) ELSE 4 END, '0');
    IF _kind = 'quote' OR NOT EXISTS (
      SELECT 1 FROM public.agency_billing_docs
      WHERE agency_id = _agency_id AND kind = 'invoice'
        AND lower(btrim(number)) = lower(btrim(candidate))
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$function$;

/* Previous mint function (rollback; does not rewind counters or change documents):
CREATE OR REPLACE FUNCTION public.mint_billing_doc_number(_agency_id uuid, _kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  y int := EXTRACT(YEAR FROM now())::int;
  n int;
  prefix text;
BEGIN
  IF _kind NOT IN ('quote','invoice') THEN
    RAISE EXCEPTION 'invalid kind: %', _kind;
  END IF;
  IF NOT (public.agency_staff_can_write(auth.uid(), _agency_id)
          OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.agency_billing_counters (agency_id, kind, year, next_value)
  VALUES (_agency_id, _kind, y, 2)
  ON CONFLICT (agency_id, kind, year)
  DO UPDATE SET next_value = public.agency_billing_counters.next_value + 1,
                updated_at = now()
  RETURNING next_value - 1 INTO n;
  prefix := CASE _kind WHEN 'invoice' THEN 'INV' ELSE 'QT' END;
  RETURN prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
END;
$function$;
*/