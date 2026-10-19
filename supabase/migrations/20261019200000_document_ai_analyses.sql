-- Document AI (Parserly) analyses: one row per uploaded document.
-- Applied 2026-10-19 via the database tool; recorded here as the single history.
-- Guarded: every statement is a no-op when the object already exists.
--
-- ROLLBACK (run manually if ever needed):
--   DROP TRIGGER IF EXISTS document_ai_analyses_touch ON public.document_ai_analyses;
--   DROP POLICY IF EXISTS "Document viewers can read its analysis" ON public.document_ai_analyses;
--   DROP TABLE IF EXISTS public.document_ai_analyses;

CREATE TABLE IF NOT EXISTS public.document_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('talent','agency')),
  document_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  agency_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','unavailable','skipped_opted_out')),
  suggestion jsonb,
  error_code text,
  provider_ref text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT document_ai_analyses_doc_key UNIQUE (scope, document_id)
);

GRANT SELECT ON public.document_ai_analyses TO authenticated;
GRANT ALL ON public.document_ai_analyses TO service_role;

ALTER TABLE public.document_ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS document_ai_analyses_requester_status_idx
  ON public.document_ai_analyses (requested_by, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_ai_analyses'
      AND policyname = 'Document viewers can read its analysis'
  ) THEN
    CREATE POLICY "Document viewers can read its analysis"
      ON public.document_ai_analyses FOR SELECT TO authenticated
      USING (
        (scope = 'talent' AND EXISTS (
          SELECT 1 FROM public.talent_private_documents d WHERE d.id = document_ai_analyses.document_id))
        OR
        (scope = 'agency' AND EXISTS (
          SELECT 1 FROM public.talent_shared_documents d WHERE d.id = document_ai_analyses.document_id))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'document_ai_analyses_touch'
  ) THEN
    CREATE TRIGGER document_ai_analyses_touch
      BEFORE UPDATE ON public.document_ai_analyses
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.document_ai_analyses IS
  'One document-AI (Parserly) analysis per document. Read: anyone RLS lets see the document. Write: server (service role) only, after checking the uploader''s ai_filing_enabled switch and, for agency rows, agency_is_writable.';