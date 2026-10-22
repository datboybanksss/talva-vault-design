-- Approved per-invitation email wording and an exact copy of the last email sent.
-- Rollback:
-- ALTER TABLE public.agency_invitations DROP COLUMN IF EXISTS email_subject, DROP COLUMN IF EXISTS email_greeting, DROP COLUMN IF EXISTS email_message, DROP COLUMN IF EXISTS sent_email_subject, DROP COLUMN IF EXISTS sent_email_html, DROP COLUMN IF EXISTS sent_email_text, DROP COLUMN IF EXISTS sent_email_at;
-- ALTER TABLE public.independent_talent_invitations DROP COLUMN IF EXISTS email_subject, DROP COLUMN IF EXISTS email_greeting, DROP COLUMN IF EXISTS email_message, DROP COLUMN IF EXISTS sent_email_subject, DROP COLUMN IF EXISTS sent_email_html, DROP COLUMN IF EXISTS sent_email_text, DROP COLUMN IF EXISTS sent_email_at;
ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_greeting text,
  ADD COLUMN IF NOT EXISTS email_message text,
  ADD COLUMN IF NOT EXISTS sent_email_subject text,
  ADD COLUMN IF NOT EXISTS sent_email_html text,
  ADD COLUMN IF NOT EXISTS sent_email_text text,
  ADD COLUMN IF NOT EXISTS sent_email_at timestamptz;
ALTER TABLE public.independent_talent_invitations
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_greeting text,
  ADD COLUMN IF NOT EXISTS email_message text,
  ADD COLUMN IF NOT EXISTS sent_email_subject text,
  ADD COLUMN IF NOT EXISTS sent_email_html text,
  ADD COLUMN IF NOT EXISTS sent_email_text text,
  ADD COLUMN IF NOT EXISTS sent_email_at timestamptz;