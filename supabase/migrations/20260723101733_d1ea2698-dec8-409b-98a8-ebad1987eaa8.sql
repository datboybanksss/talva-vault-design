
-- 1) agencies: settings + branding
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS default_quote_acceptance_days int NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS default_quote_reminder_days int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS default_invoice_payment_days int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_overdue_grace_days int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS default_vat_rate_bp int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#064E58';

-- 2) agency_billing_docs: SARS + snapshot fields
ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS recipient_vat_number text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS subtotal_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate_bp int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS is_vat_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_window_days int,
  ADD COLUMN IF NOT EXISTS payment_terms_days int,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Backfill subtotal/gross from existing total_cents so existing rows read sanely
UPDATE public.agency_billing_docs
   SET subtotal_cents = total_cents
 WHERE subtotal_cents = 0 AND total_cents > 0;

-- 3) Line items
CREATE TABLE IF NOT EXISTS public.agency_billing_doc_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.agency_billing_docs(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  vat_rate_bp int NOT NULL DEFAULT 1500,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_billing_doc_lines TO authenticated;
GRANT ALL ON public.agency_billing_doc_lines TO service_role;

ALTER TABLE public.agency_billing_doc_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members can read own doc lines"
  ON public.agency_billing_doc_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_billing_docs d
      WHERE d.id = agency_billing_doc_lines.doc_id
        AND public.is_agency_member(auth.uid(), d.agency_id)
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "agency members can write own doc lines"
  ON public.agency_billing_doc_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_billing_docs d
      WHERE d.id = agency_billing_doc_lines.doc_id
        AND public.is_agency_member(auth.uid(), d.agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_billing_docs d
      WHERE d.id = agency_billing_doc_lines.doc_id
        AND public.is_agency_member(auth.uid(), d.agency_id)
    )
  );

CREATE TRIGGER agency_billing_doc_lines_touch
  BEFORE UPDATE ON public.agency_billing_doc_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS agency_billing_doc_lines_doc_id_idx
  ON public.agency_billing_doc_lines(doc_id);

-- 4) Sequential numbering counter per agency + kind + year
CREATE TABLE IF NOT EXISTS public.agency_billing_counters (
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  year int NOT NULL,
  next_value int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, kind, year)
);

GRANT SELECT ON public.agency_billing_counters TO authenticated;
GRANT ALL ON public.agency_billing_counters TO service_role;

ALTER TABLE public.agency_billing_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members can read own counters"
  ON public.agency_billing_counters FOR SELECT TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- 5) Atomic sequential number minting (SECURITY DEFINER so it can bypass the
-- read-only RLS above; enforces membership itself before minting).
CREATE OR REPLACE FUNCTION public.mint_billing_doc_number(
  _agency_id uuid,
  _kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y int := EXTRACT(YEAR FROM now())::int;
  n int;
  prefix text;
BEGIN
  IF _kind NOT IN ('quote','invoice') THEN
    RAISE EXCEPTION 'invalid kind: %', _kind;
  END IF;
  IF NOT (public.is_agency_member(auth.uid(), _agency_id)
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
$$;

REVOKE ALL ON FUNCTION public.mint_billing_doc_number(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mint_billing_doc_number(uuid, text) TO authenticated;
