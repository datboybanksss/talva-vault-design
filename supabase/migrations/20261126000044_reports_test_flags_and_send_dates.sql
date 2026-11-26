-- Record of two approved data changes applied on 26 Nov 2026 (already applied to the live database
-- with Admin audit entries: mark_test_account ×5 and restore_invitation_first_sent_dates).
-- Both statements are no-ops when the change is already present.
--
-- 1. Product-owner decision: the agencies named "Test" (two records), "test123", "test2" and
--    "Agency test" are Test accounts. Only the flag changes.
--    Rollback: UPDATE public.agencies SET is_test=false WHERE id IN (the target ids in the audit entries).
UPDATE public.agencies SET is_test = true
WHERE is_test = false AND lower(btrim(name)) IN ('test','test123','test2','agency test');

-- 2. Older invitations had no first-send date. It is restored from the earliest recorded send:
--    the audit-trail send event, otherwise the stored send date. Drafts are never touched.
--    Rollback: the restored ids and dates are listed in the audit entry's detail; set first_sent_at
--    back to NULL for those ids.
UPDATE public.agency_invitations i SET first_sent_at = LEAST(i.last_sent_at,
   (SELECT min(x.created_at) FROM public.admin_audit_log x WHERE x.target_id = i.id::text AND x.action IN ('create_agency_invitation','finalize_agency_invitation','resend_invitation')),
   (SELECT min(x.created_at) FROM public.agency_audit_log x WHERE x.target_id::text = i.id::text AND x.action IN ('create_staff_invitation','resend_staff_invitation')))
WHERE i.first_sent_at IS NULL AND i.status::text <> 'draft' AND i.last_sent_at IS NOT NULL;
UPDATE public.talent_invitations i SET first_sent_at = LEAST(i.last_sent_at,
   (SELECT min(x.created_at) FROM public.agency_audit_log x WHERE x.target_id::text = i.id::text AND x.action IN ('create_talent_invitation','resend_talent_invitation')))
WHERE i.first_sent_at IS NULL AND i.status::text <> 'draft' AND i.last_sent_at IS NOT NULL;
