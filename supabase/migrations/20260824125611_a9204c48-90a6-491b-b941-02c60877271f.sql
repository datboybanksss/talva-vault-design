CREATE TABLE public.public_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  subject text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, subject)
);

GRANT ALL ON public.public_rate_limits TO service_role;

ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to rate limit rows"
  ON public.public_rate_limits FOR ALL
  USING (false) WITH CHECK (false);

CREATE INDEX idx_public_rate_limits_window ON public.public_rate_limits (window_started_at);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _bucket text,
  _subject text,
  _max_attempts integer,
  _window_seconds integer,
  _block_seconds integer DEFAULT NULL
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_rec public.public_rate_limits%ROWTYPE;
  now_ts timestamptz := now();
  block_for integer := COALESCE(_block_seconds, _window_seconds);
BEGIN
  DELETE FROM public.public_rate_limits
   WHERE updated_at < now_ts - interval '1 day';

  INSERT INTO public.public_rate_limits (bucket, subject, attempts, window_started_at, updated_at)
  VALUES (_bucket, _subject, 0, now_ts, now_ts)
  ON CONFLICT (bucket, subject) DO NOTHING;

  SELECT * INTO row_rec FROM public.public_rate_limits
   WHERE bucket = _bucket AND subject = _subject FOR UPDATE;

  IF row_rec.blocked_until IS NOT NULL AND row_rec.blocked_until > now_ts THEN
    RETURN QUERY SELECT false, 0, CEIL(EXTRACT(EPOCH FROM (row_rec.blocked_until - now_ts)))::integer;
    RETURN;
  END IF;

  IF row_rec.window_started_at < now_ts - make_interval(secs => _window_seconds)
     OR (row_rec.blocked_until IS NOT NULL AND row_rec.blocked_until <= now_ts) THEN
    row_rec.attempts := 0;
    row_rec.window_started_at := now_ts;
    row_rec.blocked_until := NULL;
  END IF;

  row_rec.attempts := row_rec.attempts + 1;

  IF row_rec.attempts > _max_attempts THEN
    row_rec.blocked_until := now_ts + make_interval(secs => block_for);
    UPDATE public.public_rate_limits
       SET attempts = row_rec.attempts,
           window_started_at = row_rec.window_started_at,
           blocked_until = row_rec.blocked_until,
           updated_at = now_ts
     WHERE id = row_rec.id;
    RETURN QUERY SELECT false, 0, block_for;
    RETURN;
  END IF;

  UPDATE public.public_rate_limits
     SET attempts = row_rec.attempts,
         window_started_at = row_rec.window_started_at,
         blocked_until = NULL,
         updated_at = now_ts
   WHERE id = row_rec.id;

  RETURN QUERY SELECT true, (_max_attempts - row_rec.attempts), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_rate_limit(_bucket text, _subject text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.public_rate_limits WHERE bucket = _bucket AND subject = _subject;
$$;

REVOKE ALL ON FUNCTION public.reset_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_rate_limit(text, text) TO service_role;