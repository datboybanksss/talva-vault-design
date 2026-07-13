
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_main_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
-- Allow policies (which run as postgres) and service_role to keep using them
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_main_admin(UUID) TO service_role;
