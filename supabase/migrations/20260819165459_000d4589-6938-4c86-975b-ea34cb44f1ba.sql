CREATE TABLE public.agency_notification_dismissals (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  snapshot integer NOT NULL DEFAULT 0,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_notification_dismissals TO authenticated;
GRANT ALL ON public.agency_notification_dismissals TO service_role;

ALTER TABLE public.agency_notification_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own agency reminder dismissals"
ON public.agency_notification_dismissals
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);