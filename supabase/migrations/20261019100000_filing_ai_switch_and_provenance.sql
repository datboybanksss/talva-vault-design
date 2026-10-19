-- Applied via Lovable Cloud on 2026-10-19. Guarded so re-applying is a no-op.
-- Rollback:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS ai_filing_enabled;
--   ALTER TABLE public.talent_private_documents DROP COLUMN IF EXISTS folder_source, DROP COLUMN IF EXISTS expiry_source;
--   ALTER TABLE public.talent_shared_documents DROP COLUMN IF EXISTS reminder_at, DROP COLUMN IF EXISTS folder_source, DROP COLUMN IF EXISTS expiry_source;

-- Per-user AI filing switch plus per-field filing provenance.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_filing_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.talent_private_documents
  ADD COLUMN IF NOT EXISTS folder_source text,
  ADD COLUMN IF NOT EXISTS expiry_source text;

ALTER TABLE public.talent_shared_documents
  ADD COLUMN IF NOT EXISTS reminder_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS folder_source text,
  ADD COLUMN IF NOT EXISTS expiry_source text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_private_documents_folder_source_check') THEN
    ALTER TABLE public.talent_private_documents
      ADD CONSTRAINT talent_private_documents_folder_source_check
      CHECK (folder_source IS NULL OR folder_source IN ('ai','filename','user'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_private_documents_expiry_source_check') THEN
    ALTER TABLE public.talent_private_documents
      ADD CONSTRAINT talent_private_documents_expiry_source_check
      CHECK (expiry_source IS NULL OR expiry_source IN ('ai','filename','user'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_shared_documents_folder_source_check') THEN
    ALTER TABLE public.talent_shared_documents
      ADD CONSTRAINT talent_shared_documents_folder_source_check
      CHECK (folder_source IS NULL OR folder_source IN ('ai','filename','user'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_shared_documents_expiry_source_check') THEN
    ALTER TABLE public.talent_shared_documents
      ADD CONSTRAINT talent_shared_documents_expiry_source_check
      CHECK (expiry_source IS NULL OR expiry_source IN ('ai','filename','user'));
  END IF;
END $$;