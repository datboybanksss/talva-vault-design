UPDATE public.admin_audit_log SET actor_id = NULL WHERE actor_id = 'a6548ccf-20b8-4062-b78a-f96a29b30093';
DELETE FROM auth.users WHERE lower(email) = 'israel@npiconsulting.co.za';