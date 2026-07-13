ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS designation text;

-- Best-effort backfill: split display_name into first / last on a single space.
UPDATE public.profiles
SET
  first_name = COALESCE(first_name, NULLIF(split_part(display_name, ' ', 1), '')),
  last_name  = COALESCE(
    last_name,
    NULLIF(
      CASE
        WHEN position(' ' IN display_name) > 0
          THEN substring(display_name FROM position(' ' IN display_name) + 1)
        ELSE ''
      END,
      ''
    )
  )
WHERE display_name IS NOT NULL;