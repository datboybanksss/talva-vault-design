-- Performance indexes: cover foreign keys, RLS helper lookups and hot list/count filters.

CREATE INDEX IF NOT EXISTS idx_billing_docs_agency_issued
  ON public.agency_billing_docs (agency_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_docs_agency_status
  ON public.agency_billing_docs (agency_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_doc_lines_doc
  ON public.agency_billing_doc_lines (doc_id);

CREATE INDEX IF NOT EXISTS idx_talent_invitations_agency
  ON public.talent_invitations (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_invitations_email
  ON public.talent_invitations (lower(email));

CREATE INDEX IF NOT EXISTS idx_agency_invitations_agency
  ON public.agency_invitations (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_invitations_email
  ON public.agency_invitations (lower(email));

-- is_agency_member()/has_agency_role() filter on user_id first; the existing
-- unique index is (agency_id, user_id) so user_id alone was not indexed.
CREATE INDEX IF NOT EXISTS idx_agency_members_user
  ON public.agency_members (user_id);

CREATE INDEX IF NOT EXISTS idx_talent_profiles_user
  ON public.talent_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_agency
  ON public.talent_profiles (agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_talent_links_profile
  ON public.agency_talent_links (talent_profile_id);
CREATE INDEX IF NOT EXISTS idx_agency_talent_links_manager
  ON public.agency_talent_links (manager_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_talent_links_agency_status
  ON public.agency_talent_links (agency_id, status);

CREATE INDEX IF NOT EXISTS idx_loved_one_shares_talent
  ON public.loved_one_shares (talent_id);

-- is_restricted_folder_name() looks up (agency_id, folder_name) per row inside
-- the talent_shared_documents SELECT policy.
CREATE INDEX IF NOT EXISTS idx_agency_talent_folders_agency_name
  ON public.agency_talent_folders (agency_id, folder_name);

CREATE INDEX IF NOT EXISTS idx_shared_docs_agency_created
  ON public.talent_shared_documents (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_docs_agency_expiry
  ON public.talent_shared_documents (agency_id, validity_expires_at)
  WHERE validity_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shared_docs_link_folder
  ON public.talent_shared_documents (talent_link_id, folder);

CREATE INDEX IF NOT EXISTS idx_doc_req_history_request
  ON public.agency_document_request_history (request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_audit_actor_created
  ON public.talent_audit_log (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_doc_versions_doc
  ON public.talent_shared_document_versions (document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_retention_rules_agency_scope
  ON public.agency_retention_rules (agency_id, scope, scope_value);

ANALYZE public.talent_shared_documents;
ANALYZE public.agency_talent_links;
ANALYZE public.agency_billing_docs;
ANALYZE public.agency_talent_folders;