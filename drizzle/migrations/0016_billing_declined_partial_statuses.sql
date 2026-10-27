ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'partial';
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.attach_talent_invite_private(uuid,uuid,text)'::regprocedure) INTO definition;
  definition := replace(definition, '_actor_email text)', '_actor_email text DEFAULT NULL::text)');
  EXECUTE definition;
END $$;