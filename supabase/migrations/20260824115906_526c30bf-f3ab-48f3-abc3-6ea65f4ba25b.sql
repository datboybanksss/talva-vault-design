DROP POLICY IF EXISTS "Admins read loved one shares" ON public.loved_one_shares;

CREATE OR REPLACE VIEW public.admin_loved_one_shares_view
WITH (security_barrier = true) AS
  SELECT
    s.id,
    s.talent_id,
    s.loved_one_name,
    s.loved_one_email,
    s.relationship,
    s.note,
    s.share_kind,
    s.permission,
    s.scope,
    s.created_by,
    s.created_at,
    s.expires_at,
    s.revoked_at,
    s.is_active,
    s.locked_at,
    s.failed_attempts,
    s.last_viewed_at,
    s.view_count,
    s.email_sent_at,
    (s.access_code_hash IS NOT NULL) AS has_access_code,
    (
      s.is_active
      AND s.revoked_at IS NULL
      AND s.locked_at IS NULL
      AND s.expires_at > now()
    ) AS is_currently_active,
    (s.expires_at <= now()) AS is_expired
  FROM public.loved_one_shares s
  WHERE public.has_role(auth.uid(), 'admin'::app_role);

REVOKE ALL ON public.admin_loved_one_shares_view FROM anon;
GRANT SELECT ON public.admin_loved_one_shares_view TO authenticated;
GRANT ALL ON public.admin_loved_one_shares_view TO service_role;

COMMENT ON VIEW public.admin_loved_one_shares_view IS
  'Admin-only support/audit view of Loved One shares. Excludes token and access_code_hash so an admin can never obtain the bearer credential for a share link.';