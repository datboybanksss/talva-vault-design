ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS billing_from_email text,
  ADD COLUMN IF NOT EXISTS billing_from_name text,
  ADD COLUMN IF NOT EXISTS billing_from_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_from_token text,
  ADD COLUMN IF NOT EXISTS billing_from_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_from_last_sent_at timestamptz;

ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS recipient_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_sent_to text[];

-- Backfill the recipient list from the existing single recipient field.
UPDATE public.agency_billing_docs
SET recipient_emails = ARRAY[recipient_email]
WHERE recipient_email IS NOT NULL
  AND btrim(recipient_email) <> ''
  AND cardinality(recipient_emails) = 0;