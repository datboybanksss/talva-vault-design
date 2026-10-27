-- Guarded mirror of applied database change; enum additions and default are idempotent.
-- Rollback: ALTER FUNCTION public.attach_talent_invite_private(uuid, uuid, text) CALLED ON NULL INPUT;
-- To remove the default, restore its previous pg_get_functiondef without DEFAULT NULL.
-- Enum labels cannot safely be removed; stop writing them before any future additive retirement.
ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'partial';
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.attach_talent_invite_private(uuid,uuid,text)'::regprocedure) INTO definition;
  definition := replace(definition, '_actor_email text)', '_actor_email text DEFAULT NULL::text)');
  EXECUTE definition;
END $$;