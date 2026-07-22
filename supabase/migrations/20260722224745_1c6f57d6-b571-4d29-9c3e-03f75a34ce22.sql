
CREATE TABLE public.admin_notification_dismissals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  snapshot integer NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notification_dismissals TO authenticated;
GRANT ALL ON public.admin_notification_dismissals TO service_role;

ALTER TABLE public.admin_notification_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own dismissals"
ON public.admin_notification_dismissals
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));
