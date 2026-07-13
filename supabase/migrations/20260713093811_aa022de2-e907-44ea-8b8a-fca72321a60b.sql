
DO $$
DECLARE
  agency_ids uuid[];
  agency_id_texts text[];
BEGIN
  SELECT array_agg(id), array_agg(id::text) INTO agency_ids, agency_id_texts
  FROM public.agencies WHERE name LIKE 'E2E Agency %';
  IF agency_ids IS NULL THEN RETURN; END IF;

  DELETE FROM public.agency_invitations WHERE agency_id = ANY(agency_ids);
  DELETE FROM public.agency_members WHERE agency_id = ANY(agency_ids);
  DELETE FROM public.agency_documents WHERE agency_id = ANY(agency_ids);
  DELETE FROM public.agency_billing_docs WHERE agency_id = ANY(agency_ids);
  DELETE FROM public.loved_one_shares WHERE talent_id IN (SELECT id FROM public.talent_profiles WHERE agency_id = ANY(agency_ids));
  DELETE FROM public.talent_invitations WHERE agency_id = ANY(agency_ids);
  DELETE FROM public.talent_profiles WHERE agency_id = ANY(agency_ids);
  DELETE FROM public.admin_notifications WHERE target_type = 'agency' AND target_id = ANY(agency_id_texts);
  DELETE FROM public.admin_audit_log WHERE target_type = 'agency' AND target_id = ANY(agency_id_texts);
  DELETE FROM public.agencies WHERE id = ANY(agency_ids);
END $$;
