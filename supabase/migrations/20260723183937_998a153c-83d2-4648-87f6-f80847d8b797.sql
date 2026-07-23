
-- Loved-One magic-link sharing + Talent Activation profile fields
ALTER TABLE public.loved_one_shares
  ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS loved_one_name text,
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS scope jsonb NOT NULL DEFAULT '{"private_folder_ids":[],"private_document_ids":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text;

CREATE UNIQUE INDEX IF NOT EXISTS loved_one_shares_token_key ON public.loved_one_shares(token);
CREATE INDEX IF NOT EXISTS loved_one_shares_created_by_idx ON public.loved_one_shares(created_by);

-- RLS: talent (owner) manages their own shares via created_by
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loved_one_shares TO authenticated;
GRANT ALL ON public.loved_one_shares TO service_role;

DROP POLICY IF EXISTS "Talent manage own loved one shares" ON public.loved_one_shares;
CREATE POLICY "Talent manage own loved one shares" ON public.loved_one_shares
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Talent Activation Wizard fields (self + admin only via existing profile policies)
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS is_provisional_taxpayer boolean,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS activation_completed_at timestamptz;

-- Ensure talent can read/update own profile (agency must NOT see sensitive PII)
GRANT SELECT, INSERT, UPDATE ON public.talent_profiles TO authenticated;
GRANT ALL ON public.talent_profiles TO service_role;

DROP POLICY IF EXISTS "Talent read own profile" ON public.talent_profiles;
CREATE POLICY "Talent read own profile" ON public.talent_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Talent update own profile" ON public.talent_profiles;
CREATE POLICY "Talent update own profile" ON public.talent_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
