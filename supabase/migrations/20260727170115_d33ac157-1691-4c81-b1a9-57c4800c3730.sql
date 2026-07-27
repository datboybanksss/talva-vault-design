ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS expiry_notice_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_expiry_notice_days_range
  CHECK (expiry_notice_days BETWEEN 1 AND 365);