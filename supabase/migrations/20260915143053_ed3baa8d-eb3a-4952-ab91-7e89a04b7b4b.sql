ALTER TABLE public.talent_notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS talent_notifications_user_read_idx ON public.talent_notifications (user_id, read_at);