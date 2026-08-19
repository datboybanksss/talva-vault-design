CREATE TABLE public.agency_folder_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  folder_name text NOT NULL,
  applied_by_default boolean NOT NULL DEFAULT true,
  ai_filing_allowed boolean NOT NULL DEFAULT true,
  default_validity_rule text NOT NULL DEFAULT 'No expiry unless document indicates one',
  can_untick_during_onboarding boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, folder_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_folder_settings TO authenticated;
GRANT ALL ON public.agency_folder_settings TO service_role;

ALTER TABLE public.agency_folder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view folder settings"
  ON public.agency_folder_settings FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agency owners can insert folder settings"
  ON public.agency_folder_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));

CREATE POLICY "Agency owners can update folder settings"
  ON public.agency_folder_settings FOR UPDATE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'))
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));

CREATE POLICY "Agency owners can delete folder settings"
  ON public.agency_folder_settings FOR DELETE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'));

CREATE TRIGGER agency_folder_settings_touch
  BEFORE UPDATE ON public.agency_folder_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();