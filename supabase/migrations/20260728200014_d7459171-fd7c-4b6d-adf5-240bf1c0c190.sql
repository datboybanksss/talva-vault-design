CREATE TABLE public.talent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_label text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.talent_audit_log TO authenticated;
GRANT ALL ON public.talent_audit_log TO service_role;

ALTER TABLE public.talent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent can view their own audit entries"
  ON public.talent_audit_log FOR SELECT TO authenticated
  USING (actor_id = auth.uid());

CREATE POLICY "Talent can write their own audit entries"
  ON public.talent_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE INDEX talent_audit_log_actor_created_idx
  ON public.talent_audit_log (actor_id, created_at DESC);

CREATE TABLE public.talent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  detail text,
  tone text NOT NULL DEFAULT 'amber',
  target_type text,
  target_id text,
  due_at timestamptz,
  email_sent_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

GRANT SELECT, UPDATE ON public.talent_notifications TO authenticated;
GRANT ALL ON public.talent_notifications TO service_role;

ALTER TABLE public.talent_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent can view their own notifications"
  ON public.talent_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Talent can dismiss their own notifications"
  ON public.talent_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX talent_notifications_user_idx
  ON public.talent_notifications (user_id, created_at DESC);

CREATE TRIGGER talent_notifications_touch
  BEFORE UPDATE ON public.talent_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT
  '{"in_app":{"agency_share":true,"doc_expiring":true,"share_expiring":true,"ai_review":true},"email":false}'::jsonb;