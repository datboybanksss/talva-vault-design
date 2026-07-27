ALTER TABLE public.talent_private_folders
  ADD COLUMN IF NOT EXISTS removed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS talent_private_folders_user_removed_idx
  ON public.talent_private_folders (user_id, removed_at);