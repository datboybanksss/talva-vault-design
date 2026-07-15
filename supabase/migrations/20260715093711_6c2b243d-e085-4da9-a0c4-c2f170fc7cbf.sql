ALTER TYPE public.agency_talent_link_status ADD VALUE IF NOT EXISTS 'ended';

ALTER TABLE public.agency_talent_links
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by uuid REFERENCES auth.users(id);