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

-- 3. Product-owner decision, 28 Nov 2026 (already applied, audited as mark_test_account ×8): talent
--    linked to a Test agency and clearly test-named talent are Test accounts. Only the flag changes.
--    Rollback: UPDATE public.talent_profiles SET is_test=false WHERE id IN (the ids below).
UPDATE public.talent_profiles SET is_test = true WHERE is_test = false AND id IN (
 'e58b18f1-df84-48e0-83ee-71bd95c38e15','9c66b520-797b-484d-8cee-3706d0da5cae',
 '6011708f-717a-4514-b1ff-cc97dc9b9c68','d385cb8f-2c64-468b-b3a8-cd353878c0f1',
 'ae841a7c-fa08-4bd6-a1dd-931815b32a57','8d583961-5fcf-44e1-9ac3-d6e910b3be75',
 'c182ec77-5235-4c43-9d8f-3425ede17a95','4fc4fe02-c2b3-4057-851c-48a381ff3066');
