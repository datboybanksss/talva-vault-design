-- Talent keep read-only access to an agency's items for a fixed 10 years after the
-- relationship ends (link ended/revoked/expired) or the agency is offboarded
-- (suspended), whichever is earlier. Replaces the per-item retention cut-off.
-- The 10 years lives only in public.talent_post_end_access_years().
-- Recorded here from the Drizzle folder so all history lives in supabase/migrations.
-- ALREADY APPLIED to the live database; the guard makes this a no-op where the
-- objects exist, so it never re-applies.
--
-- ROLLBACK (run manually, only if this change must be undone):
--   CREATE OR REPLACE FUNCTION public.talent_can_read_shared_doc(_link_id uuid, _originator text, _years integer)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.agency_talent_links l
--      WHERE l.id = _link_id AND l.talent_user_id = auth.uid()
--        AND (_originator = 'talent' OR l.status NOT IN ('ended','revoked','expired')
--             OR l.ended_at IS NULL OR _years IS NULL
--             OR l.ended_at + make_interval(years => _years) > now())); $$;
--   DROP FUNCTION IF EXISTS public.talent_link_read_until(uuid);
--   DROP FUNCTION IF EXISTS public.talent_link_closed_at(uuid);
--   DROP FUNCTION IF EXISTS public.talent_post_end_access_years();

DO $guard$
BEGIN
  IF to_regprocedure('public.talent_link_read_until(uuid)') IS NOT NULL THEN
    RAISE NOTICE 'already applied, skipping';
    RETURN;
  END IF;
  EXECUTE $mig$
CREATE OR REPLACE FUNCTION public.talent_post_end_access_years()
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT 10 $$;
COMMENT ON FUNCTION public.talent_post_end_access_years() IS 'Single source: years talent keep read-only access to an agency''s items after the relationship ends or the agency is offboarded.';

CREATE OR REPLACE FUNCTION public.talent_link_closed_at(_link_id uuid)
 RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN l.status IN ('ended','revoked','expired') AND a.status = 'suspended'
      THEN LEAST(COALESCE(l.ended_at, l.updated_at), COALESCE(a.suspended_at, a.updated_at))
    WHEN l.status IN ('ended','revoked','expired') THEN COALESCE(l.ended_at, l.updated_at)
    WHEN a.status = 'suspended' THEN COALESCE(a.suspended_at, a.updated_at)
    ELSE NULL END
  FROM public.agency_talent_links l
  JOIN public.agencies a ON a.id = l.agency_id
  WHERE l.id = _link_id
$$;

CREATE OR REPLACE FUNCTION public.talent_link_read_until(_link_id uuid)
 RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.talent_link_closed_at(_link_id)
         + make_interval(years => public.talent_post_end_access_years())
$$;

CREATE OR REPLACE FUNCTION public.talent_can_read_shared_doc(_link_id uuid, _originator text, _years integer)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  -- _years is ignored (kept for the policy signature): the post-end window is fixed.
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agency_talent_links l
     WHERE l.id = _link_id AND l.talent_user_id = auth.uid()
       AND (
         _originator = 'talent'
         OR public.talent_link_read_until(l.id) IS NULL
         OR public.talent_link_read_until(l.id) > now()
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.talent_post_end_access_years() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.talent_link_closed_at(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.talent_link_read_until(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talent_post_end_access_years() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talent_link_closed_at(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.talent_link_read_until(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.talent_can_read_shared_doc(uuid, text, integer) FROM PUBLIC, anon;
  $mig$;
END
$guard$;
