ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS main_contact_first_name text,
  ADD COLUMN IF NOT EXISTS main_contact_last_name text,
  ADD COLUMN IF NOT EXISTS main_contact_email text,
  ADD COLUMN IF NOT EXISTS main_contact_phone text;