ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_seen_onboarding boolean NOT NULL DEFAULT false;

-- Existing accounts must not be shown the first-run tour.
UPDATE public.profiles SET has_seen_onboarding = true;

-- New talents get a smart starter set of categories; the remaining ones stay
-- available on demand from Settings -> Manage folders. Runs at profile-creation
-- time only, so existing talents keep whatever they already have.
CREATE OR REPLACE FUNCTION public.seed_talent_private_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $trg$
DECLARE
  starter text[] := ARRAY['Personal','Health','Financial','Insurance','Tax','Work'];
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.seed_talent_default_folders(NEW.user_id);
  DELETE FROM public.talent_private_folders
   WHERE user_id = NEW.user_id
     AND parent_id IS NULL
     AND NOT (name = ANY(starter));
  RETURN NEW;
END;
$trg$;