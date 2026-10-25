DO $checks$
DECLARE f record; expected_count bigint; admin_count bigint; non_admin_count bigint;
BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('account_paused','account_read_allowed','talent_account_writable','talent_read_only_until','talent_link_is_ended','current_retention_rule','document_setting','storage_path_is_document','validated_storage_object','list_recently_deleted_documents','restore_deleted_document','soft_delete_agency_document','stop_sharing_document','sweep_overdue_invoices') LOOP
  IF has_function_privilege('anon',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Anonymous function grant test failed: %',f.proname; END IF;
  IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Service function grant test failed: %',f.proname; END IF;
  IF (f.proname='sweep_overdue_invoices') = has_function_privilege('authenticated',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Authenticated function grant test failed: %',f.proname; END IF;
 END LOOP;
 SELECT count(*) INTO expected_count FROM public.loved_one_shares;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1),'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO admin_count FROM public.admin_loved_one_shares_view;
 EXECUTE 'RESET ROLE';
 IF admin_count <> expected_count THEN RAISE EXCEPTION 'Admin invoker-view test failed: % / %',admin_count,expected_count; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub','1bd113ae-729a-4367-b83d-405b76f9e1c5','role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO non_admin_count FROM public.admin_loved_one_shares_view;
 EXECUTE 'RESET ROLE';
 IF non_admin_count <> 0 THEN RAISE EXCEPTION 'Non-admin invoker-view test failed'; END IF;
 PERFORM set_config('request.jwt.claims','{}',true);
END $checks$;
-- Read-only security assertions: no accounts, documents or shares are modified.