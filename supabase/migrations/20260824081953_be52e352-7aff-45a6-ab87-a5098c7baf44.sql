-- Grouped counts for the agency Document Vault (security invoker: RLS still applies)

CREATE OR REPLACE FUNCTION public.agency_vault_talent_summary(_agency_id uuid)
RETURNS TABLE (
  talent_link_id uuid,
  doc_count bigint,
  review_count bigint,
  folder_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.id,
    COALESCE(d.total, 0)::bigint,
    COALESCE(d.review, 0)::bigint,
    COALESCE(f.folders, 0)::bigint
  FROM public.agency_talent_links l
  LEFT JOIN (
    SELECT talent_link_id,
           count(*) AS total,
           count(*) FILTER (WHERE pending_review OR status = 'needs_review') AS review
    FROM public.talent_shared_documents
    WHERE agency_id = _agency_id
    GROUP BY talent_link_id
  ) d ON d.talent_link_id = l.id
  LEFT JOIN (
    SELECT talent_link_id, count(*) AS folders
    FROM public.agency_talent_folders
    WHERE agency_id = _agency_id AND parent_folder_id IS NULL
    GROUP BY talent_link_id
  ) f ON f.talent_link_id = l.id
  WHERE l.agency_id = _agency_id;
$$;

CREATE OR REPLACE FUNCTION public.agency_vault_folder_counts(_agency_id uuid, _talent_link_id uuid)
RETURNS TABLE (
  folder text,
  doc_count bigint,
  review_count bigint,
  expiring_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    d.folder,
    count(*)::bigint,
    count(*) FILTER (WHERE d.pending_review OR d.status = 'needs_review')::bigint,
    count(*) FILTER (
      WHERE d.validity_expires_at IS NOT NULL
        AND d.validity_expires_at >= now()
        AND d.validity_expires_at <= now() + interval '90 days'
    )::bigint
  FROM public.talent_shared_documents d
  WHERE d.agency_id = _agency_id
    AND d.talent_link_id = _talent_link_id
  GROUP BY d.folder;
$$;

REVOKE EXECUTE ON FUNCTION public.agency_vault_talent_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agency_vault_folder_counts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_vault_talent_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_vault_folder_counts(uuid, uuid) TO authenticated;