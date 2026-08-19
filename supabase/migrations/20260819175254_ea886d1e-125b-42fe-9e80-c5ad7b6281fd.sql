-- 1. Pin search_path on the four email-queue helpers
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';

-- 2. Revoke broad EXECUTE on privileged SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.compute_document_locked_until(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_agency_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_retention_lock_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_rule_refresh_docs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_talent_private_folders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tsd_after_insert_refresh_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_map_legacy_folder(text) FROM PUBLIC, anon, authenticated;

-- 3. Functions needed by RLS policies / app RPC: signed-in only, never anonymous
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_agency_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_agency_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_main_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_admin_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mint_billing_doc_number(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_agency_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_main_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mint_billing_doc_number(uuid, text) TO authenticated;