CREATE OR REPLACE FUNCTION public.talent_registration_privacy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_TABLE_NAME='talent_profiles' THEN
  IF NEW.id_number IS NOT NULL AND (TG_OP='INSERT' OR NEW.id_number IS DISTINCT FROM OLD.id_number) THEN RAISE EXCEPTION 'Talent ID numbers are not collected.'; END IF;
 ELSIF TG_TABLE_NAME='independent_talent_invitations' THEN
  IF NEW.date_of_birth IS NOT NULL AND (TG_OP='INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth) THEN RAISE EXCEPTION 'Date of birth must be supplied by the talent during activation.'; END IF;
 ELSIF TG_TABLE_NAME='talent_invitation_documents' THEN
  IF NEW.doc_slot='id_document' THEN RAISE EXCEPTION 'Talent ID copies are not collected.'; END IF;
 ELSIF TG_TABLE_NAME='onboarding_staged_uploads' THEN
  IF NEW.doc_slot='id_document' AND NEW.kind='talent' THEN RAISE EXCEPTION 'Talent ID copies are not collected.'; END IF;
 END IF;
 RETURN NEW;
END $$;
/* Structural rollback: remove the four privacy triggers and function as documented in the original privacy migration, leaving retained legacy/additive columns inert. Do not restore the defective prior function. Data/file erasure has no rollback. */