-- 1. Administrator invitation token
ALTER TABLE public.admin_invitations ADD COLUMN IF NOT EXISTS token text;

UPDATE public.admin_invitations
SET token = encode(extensions.gen_random_bytes(24), 'hex')
WHERE token IS NULL;

ALTER TABLE public.admin_invitations
  ALTER COLUMN token SET DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  ALTER COLUMN token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_invitations_token_key
  ON public.admin_invitations (token);

-- 2. Email send tracking
ALTER TABLE public.admin_invitations  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.agency_invitations ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.talent_invitations ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;