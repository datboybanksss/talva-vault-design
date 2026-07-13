
DELETE FROM public.admin_notifications WHERE target_type='agency' AND target_id='11111111-1111-1111-1111-111111111111';
DELETE FROM public.admin_audit_log WHERE target_type='agency' AND target_id='11111111-1111-1111-1111-111111111111';
DELETE FROM public.admin_audit_log WHERE actor_id='d64ba695-ac9f-468b-92b1-922d952e6147';
DELETE FROM public.agencies WHERE id='11111111-1111-1111-1111-111111111111';
DELETE FROM public.user_roles WHERE user_id='d64ba695-ac9f-468b-92b1-922d952e6147';
