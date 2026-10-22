-- Client book: South African address fields, frozen client copy on issued
-- quotes/invoices, drafts follow the client's latest details.
-- Guarded: every statement is IF NOT EXISTS / OR REPLACE / DROP IF EXISTS, so it
-- is a no-op where already applied.
-- Rollback:
--   DROP TRIGGER IF EXISTS agency_client_refresh_drafts ON public.agency_clients;
--   DROP TRIGGER IF EXISTS billing_doc_client_sync ON public.agency_billing_docs;
--   DROP FUNCTION IF EXISTS public.agency_client_refresh_drafts(), public.billing_doc_client_sync(),
--     public.billing_client_address(public.agency_clients);
--   ALTER TABLE public.agency_billing_docs DROP COLUMN IF EXISTS client_snapshot, DROP COLUMN IF EXISTS client_snapshot_at;
--   ALTER TABLE public.agency_clients ALTER COLUMN country DROP DEFAULT;
--   ALTER TABLE public.agency_clients DROP COLUMN IF EXISTS address_suburb, DROP COLUMN IF EXISTS province,
--     DROP COLUMN IF EXISTS postal_code;
ALTER TABLE public.agency_clients
  ADD COLUMN IF NOT EXISTS address_suburb text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.agency_clients ALTER COLUMN country SET DEFAULT 'South Africa';
COMMENT ON COLUMN public.agency_clients.address IS 'Billing address: street line(s).';

ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS client_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS client_snapshot_at timestamptz;
COMMENT ON COLUMN public.agency_billing_docs.client_snapshot IS
  'Copy of the client''s details taken when the document left draft; never changed afterwards.';

CREATE OR REPLACE FUNCTION public.billing_client_address(c public.agency_clients)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(concat_ws(', ',
    NULLIF(btrim(c.address), ''), NULLIF(btrim(c.address_suburb), ''), NULLIF(btrim(c.city), ''),
    NULLIF(btrim(c.province), ''), NULLIF(btrim(c.postal_code), ''), NULLIF(btrim(c.country), '')), '');
$$;

-- Drafts always show the client's latest details; the moment a document leaves
-- draft its client details are copied onto it and frozen (legal record).
CREATE OR REPLACE FUNCTION public.billing_doc_client_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c public.agency_clients;
  was_draft boolean := (TG_OP = 'INSERT') OR (OLD.status = 'draft');
BEGIN
  IF NOT was_draft THEN
    -- Issued: client and its copied details can never change.
    NEW.client_id := OLD.client_id;
    NEW.client_snapshot := OLD.client_snapshot;
    NEW.client_snapshot_at := OLD.client_snapshot_at;
    NEW.client_name := OLD.client_name;
    NEW.recipient_contact_person := OLD.recipient_contact_person;
    NEW.recipient_address := OLD.recipient_address;
    NEW.recipient_vat_number := OLD.recipient_vat_number;
    NEW.recipient_email := OLD.recipient_email;
    NEW.recipient_emails := OLD.recipient_emails;
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'CLIENT_REQUIRED: choose a client before sending this %.', NEW.kind;
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO c FROM public.agency_clients
   WHERE id = NEW.client_id AND agency_id = NEW.agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That client could not be found on your agency.';
  END IF;
  IF c.archived_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
    RAISE EXCEPTION 'That client has been archived. Restore them first, or choose another client.';
  END IF;

  NEW.client_name := c.name;
  NEW.recipient_contact_person := c.contact_person;
  NEW.recipient_address := public.billing_client_address(c);
  NEW.recipient_vat_number := c.vat_number;
  NEW.recipient_emails := COALESCE(c.emails, '{}');
  NEW.recipient_email := c.emails[1];

  IF NEW.status <> 'draft' THEN
    NEW.client_snapshot := jsonb_build_object(
      'name', c.name, 'trading_name', c.trading_name,
      'company_registration_number', c.company_registration_number,
      'vat_number', c.vat_number, 'contact_person', c.contact_person,
      'emails', to_jsonb(COALESCE(c.emails, '{}')), 'phone', c.phone,
      'address', c.address, 'address_suburb', c.address_suburb, 'city', c.city,
      'province', c.province, 'postal_code', c.postal_code, 'country', c.country,
      'payment_terms_days', c.payment_terms_days);
    NEW.client_snapshot_at := now();
  ELSE
    NEW.client_snapshot := NULL;
    NEW.client_snapshot_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS billing_doc_client_sync ON public.agency_billing_docs;
CREATE TRIGGER billing_doc_client_sync BEFORE INSERT OR UPDATE ON public.agency_billing_docs
  FOR EACH ROW EXECUTE FUNCTION public.billing_doc_client_sync();

-- Editing a client refreshes the details shown on its draft documents only.
CREATE OR REPLACE FUNCTION public.agency_client_refresh_drafts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.agency_billing_docs
     SET client_id = client_id
   WHERE client_id = NEW.id AND agency_id = NEW.agency_id AND status = 'draft';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agency_client_refresh_drafts ON public.agency_clients;
CREATE TRIGGER agency_client_refresh_drafts AFTER UPDATE ON public.agency_clients
  FOR EACH ROW EXECUTE FUNCTION public.agency_client_refresh_drafts();
