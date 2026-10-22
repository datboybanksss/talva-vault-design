-- Test vs real accounts: agencies get the same is_test marker talent_profiles already has.
-- Rollback:
-- ALTER TABLE public.agencies DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.agencies.is_test IS 'Test account: excluded from reporting and launch offer places by default.';
