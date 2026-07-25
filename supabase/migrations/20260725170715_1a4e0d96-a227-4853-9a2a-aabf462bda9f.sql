REVOKE ALL ON FUNCTION public.seed_talent_default_folders(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_talent_default_folders(uuid) TO service_role;