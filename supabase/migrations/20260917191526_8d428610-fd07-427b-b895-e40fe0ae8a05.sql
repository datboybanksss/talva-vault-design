CREATE TABLE public.mfa_settings (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  enrolled_at timestamp with time zone,
  explainer_seen_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mfa_settings_channel_check CHECK (channel IN ('email'))
);

GRANT SELECT ON public.mfa_settings TO authenticated;
GRANT ALL ON public.mfa_settings TO service_role;

ALTER TABLE public.mfa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own mfa settings"
  ON public.mfa_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_mfa_settings_touch
  BEFORE UPDATE ON public.mfa_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.mfa_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  destination text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.mfa_codes TO service_role;

ALTER TABLE public.mfa_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_mfa_codes_user_active ON public.mfa_codes (user_id, consumed_at, expires_at DESC);

CREATE TRIGGER trg_mfa_codes_touch
  BEFORE UPDATE ON public.mfa_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.mfa_verified_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  verified_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

GRANT ALL ON public.mfa_verified_sessions TO service_role;

ALTER TABLE public.mfa_verified_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_mfa_verified_sessions_touch
  BEFORE UPDATE ON public.mfa_verified_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();