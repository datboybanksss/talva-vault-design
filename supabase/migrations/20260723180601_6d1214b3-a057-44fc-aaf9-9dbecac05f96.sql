
-- Folders
CREATE TABLE public.talent_private_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.talent_private_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  tone text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tpf_user ON public.talent_private_folders(user_id);
CREATE INDEX idx_tpf_parent ON public.talent_private_folders(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_private_folders TO authenticated;
GRANT ALL ON public.talent_private_folders TO service_role;
ALTER TABLE public.talent_private_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent manages own private folders"
  ON public.talent_private_folders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tpf_touch_updated_at BEFORE UPDATE ON public.talent_private_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Documents
CREATE TABLE public.talent_private_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.talent_private_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  reminder_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tpd_user ON public.talent_private_documents(user_id);
CREATE INDEX idx_tpd_folder ON public.talent_private_documents(folder_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_private_documents TO authenticated;
GRANT ALL ON public.talent_private_documents TO service_role;
ALTER TABLE public.talent_private_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent manages own private documents"
  ON public.talent_private_documents FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tpd_touch_updated_at BEFORE UPDATE ON public.talent_private_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies: each user owns files under their own uid prefix in
-- the talent-private-documents bucket.
CREATE POLICY "Talent reads own private files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'talent-private-documents'
         AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Talent writes own private files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'talent-private-documents'
              AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Talent updates own private files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'talent-private-documents'
         AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'talent-private-documents'
              AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Talent deletes own private files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'talent-private-documents'
         AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed the six default top-level folders for existing talent profiles.
INSERT INTO public.talent_private_folders (user_id, name, icon, tone, sort_order)
SELECT tp.user_id, f.name, f.icon, f.tone, f.sort_order
FROM public.talent_profiles tp
CROSS JOIN (VALUES
  ('Personal',   'User',       'teal',   0),
  ('Dependents', 'Baby',       'blue',   1),
  ('Health',     'HeartPulse', 'green',  2),
  ('Insurance',  'Shield',     'purple', 3),
  ('Tax',        'Landmark',   'amber',  4),
  ('Pets',       'PawPrint',   'red',    5)
) AS f(name, icon, tone, sort_order)
WHERE tp.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.talent_private_folders x
    WHERE x.user_id = tp.user_id AND x.parent_id IS NULL AND x.name = f.name
  );

-- Trigger to auto-seed the six defaults when a new talent profile is created.
CREATE OR REPLACE FUNCTION public.seed_talent_private_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.talent_private_folders (user_id, name, icon, tone, sort_order)
  SELECT NEW.user_id, f.name, f.icon, f.tone, f.sort_order
  FROM (VALUES
    ('Personal',   'User',       'teal',   0),
    ('Dependents', 'Baby',       'blue',   1),
    ('Health',     'HeartPulse', 'green',  2),
    ('Insurance',  'Shield',     'purple', 3),
    ('Tax',        'Landmark',   'amber',  4),
    ('Pets',       'PawPrint',   'red',    5)
  ) AS f(name, icon, tone, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.talent_private_folders x
    WHERE x.user_id = NEW.user_id AND x.parent_id IS NULL AND x.name = f.name
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER talent_profiles_seed_private_folders
  AFTER INSERT ON public.talent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_talent_private_folders();
