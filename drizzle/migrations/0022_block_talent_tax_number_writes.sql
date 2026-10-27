CREATE OR REPLACE FUNCTION public.talent_registration_privacy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_TABLE_NAME='talent_profiles' THEN
  IF NEW.id_number IS NOT NULL AND (TG_OP='INSERT' OR NEW.id_number IS DISTINCT FROM OLD.id_number) THEN RAISE EXCEPTION 'Talent ID numbers are not collected.'; END IF;
  IF NEW.tax_number IS NOT NULL AND (TG_OP='INSERT' OR NEW.tax_number IS DISTINCT FROM OLD.tax_number) THEN RAISE EXCEPTION 'Talent tax numbers are not collected.'; END IF;
  IF NEW.is_provisional_taxpayer IS NOT NULL AND (TG_OP='INSERT' OR NEW.is_provisional_taxpayer IS DISTINCT FROM OLD.is_provisional_taxpayer) THEN RAISE EXCEPTION 'Talent taxpayer status is not collected.'; END IF;
 ELSIF TG_TABLE_NAME='independent_talent_invitations' THEN
  IF NEW.date_of_birth IS NOT NULL AND (TG_OP='INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth) THEN RAISE EXCEPTION 'Date of birth must be supplied by the talent during activation.'; END IF;
 ELSIF TG_TABLE_NAME='talent_invitation_documents' THEN
  IF NEW.doc_slot='id_document' THEN RAISE EXCEPTION 'Talent ID copies are not collected.'; END IF;
 ELSIF TG_TABLE_NAME='onboarding_staged_uploads' THEN
  IF NEW.doc_slot='id_document' AND NEW.kind='talent' THEN RAISE EXCEPTION 'Talent ID copies are not collected.'; END IF;
 END IF;
 RETURN NEW;
END $$;
COMMENT ON COLUMN public.talent_profiles.tax_number IS 'DEPRECATED: not collected (POPIA); writes blocked by talent_registration_privacy_guard. Existing values retained pending approved erasure.';
COMMENT ON COLUMN public.talent_profiles.is_provisional_taxpayer IS 'DEPRECATED: not collected (POPIA); writes blocked by talent_registration_privacy_guard.';
/* Structural rollback: restore the previous talent_registration_privacy_guard body from drizzle/migrations/0019_talent_privacy_guard_row_safe.sql and remove the two COLUMN comments. Columns are retained, so no data is affected. No data erasure is performed in this migration. */