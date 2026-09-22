ALTER TABLE public.agency_clients
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS contact_title text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS company_registration_number text,
  ADD COLUMN IF NOT EXISTS relationship_manager_user_id uuid;

CREATE INDEX IF NOT EXISTS agency_clients_relationship_manager_idx
  ON public.agency_clients (relationship_manager_user_id);