ALTER TABLE public.talent_invitations ADD COLUMN IF NOT EXISTS acceptance_unavailable_at timestamptz;
ALTER TABLE public.independent_talent_invitations ADD COLUMN IF NOT EXISTS acceptance_unavailable_at timestamptz;
COMMENT ON COLUMN public.talent_profiles.id_number IS 'DEPRECATED: talent ID numbers are not collected; non-null writes are blocked.';
COMMENT ON COLUMN public.independent_talent_invitations.date_of_birth IS 'DEPRECATED: date of birth is supplied privately by talent during activation, not by administrators.';
CREATE OR REPLACE FUNCTION public.talent_registration_privacy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_TABLE_NAME='talent_profiles' THEN
  IF NEW.id_number IS NOT NULL AND (TG_OP='INSERT' OR NEW.id_number IS DISTINCT FROM OLD.id_number) THEN RAISE EXCEPTION 'Talent ID numbers are not collected.'; END IF;
 ELSIF TG_TABLE_NAME='independent_talent_invitations' THEN
  IF NEW.date_of_birth IS NOT NULL AND (TG_OP='INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth) THEN RAISE EXCEPTION 'Date of birth must be supplied by the talent during activation.'; END IF;
 ELSE
  IF NEW.doc_slot='id_document' AND (TG_TABLE_NAME='talent_invitation_documents' OR NEW.kind='talent') THEN RAISE EXCEPTION 'Talent ID copies are not collected.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER talent_profile_no_id_number BEFORE INSERT OR UPDATE ON public.talent_profiles FOR EACH ROW EXECUTE FUNCTION public.talent_registration_privacy_guard();
CREATE TRIGGER independent_invite_no_birth_date BEFORE INSERT OR UPDATE ON public.independent_talent_invitations FOR EACH ROW EXECUTE FUNCTION public.talent_registration_privacy_guard();
CREATE TRIGGER talent_invite_no_id_copy BEFORE INSERT OR UPDATE ON public.talent_invitation_documents FOR EACH ROW EXECUTE FUNCTION public.talent_registration_privacy_guard();
CREATE TRIGGER staged_talent_no_id_copy BEFORE INSERT OR UPDATE ON public.onboarding_staged_uploads FOR EACH ROW EXECUTE FUNCTION public.talent_registration_privacy_guard();
/* STRUCTURAL ROLLBACK (does not restore erased values/files): deploy compatible application first; DROP TRIGGER staged_talent_no_id_copy ON public.onboarding_staged_uploads; DROP TRIGGER talent_invite_no_id_copy ON public.talent_invitation_documents; DROP TRIGGER independent_invite_no_birth_date ON public.independent_talent_invitations; DROP TRIGGER talent_profile_no_id_number ON public.talent_profiles; DROP FUNCTION public.talent_registration_privacy_guard(); Keep additive acceptance_unavailable_at columns unused; clear their comments only if the privacy decision is reversed. Never restore typed ID collection automatically. */