-- Rollback:
-- DROP TABLE IF EXISTS public.platform_settings;
-- DROP TRIGGER IF EXISTS stamp_first_sent ON public.agency_invitations;
-- DROP TRIGGER IF EXISTS stamp_first_sent ON public.independent_talent_invitations;
-- DROP TRIGGER IF EXISTS stamp_first_sent ON public.talent_invitations;
-- DROP FUNCTION IF EXISTS public.stamp_invitation_first_sent();
-- ALTER TABLE public.agency_invitations DROP COLUMN IF EXISTS first_sent_at, DROP COLUMN IF EXISTS source;
-- ALTER TABLE public.independent_talent_invitations DROP COLUMN IF EXISTS first_sent_at, DROP COLUMN IF EXISTS source;
-- ALTER TABLE public.talent_invitations DROP COLUMN IF EXISTS first_sent_at;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read settings" ON public.platform_settings;
CREATE POLICY "Admins read settings" ON public.platform_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin editors write settings" ON public.platform_settings;
CREATE POLICY "Admin editors write settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.can_admin_edit(auth.uid())) WITH CHECK (public.can_admin_edit(auth.uid()));

INSERT INTO public.platform_settings (key, value) VALUES
  ('launch', '{"launch_date":"2026-11-17","window_months":3,"talent_target":100,"agency_target":5,"offer_free_months":6,"offer_talent_places":100,"offer_agency_places":5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Recording from now on: when an invitation was first sent, and where it came from.
ALTER TABLE public.agency_invitations ADD COLUMN IF NOT EXISTS first_sent_at timestamptz;
ALTER TABLE public.independent_talent_invitations ADD COLUMN IF NOT EXISTS first_sent_at timestamptz;
ALTER TABLE public.talent_invitations ADD COLUMN IF NOT EXISTS first_sent_at timestamptz;
ALTER TABLE public.agency_invitations ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.independent_talent_invitations ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.agency_invitations ALTER COLUMN source SET DEFAULT 'admin';
ALTER TABLE public.independent_talent_invitations ALTER COLUMN source SET DEFAULT 'admin';

CREATE OR REPLACE FUNCTION public.stamp_invitation_first_sent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.first_sent_at IS NULL AND NEW.status::text = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.status::text = 'draft') THEN
    NEW.first_sent_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stamp_first_sent ON public.agency_invitations;
CREATE TRIGGER stamp_first_sent BEFORE INSERT OR UPDATE ON public.agency_invitations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_invitation_first_sent();
DROP TRIGGER IF EXISTS stamp_first_sent ON public.independent_talent_invitations;
CREATE TRIGGER stamp_first_sent BEFORE INSERT OR UPDATE ON public.independent_talent_invitations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_invitation_first_sent();
DROP TRIGGER IF EXISTS stamp_first_sent ON public.talent_invitations;
CREATE TRIGGER stamp_first_sent BEFORE INSERT OR UPDATE ON public.talent_invitations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_invitation_first_sent();