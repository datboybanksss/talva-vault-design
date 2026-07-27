ALTER TABLE public.loved_one_shares
  ADD COLUMN IF NOT EXISTS access_code_hash text,
  ADD COLUMN IF NOT EXISTS permission text NOT NULL DEFAULT 'view',
  ADD COLUMN IF NOT EXISTS share_kind text NOT NULL DEFAULT 'folders',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loved_one_shares_permission_check'
  ) THEN
    ALTER TABLE public.loved_one_shares
      ADD CONSTRAINT loved_one_shares_permission_check
      CHECK (permission IN ('view', 'download'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loved_one_shares_share_kind_check'
  ) THEN
    ALTER TABLE public.loved_one_shares
      ADD CONSTRAINT loved_one_shares_share_kind_check
      CHECK (share_kind IN ('folders', 'document'));
  END IF;
END $$;