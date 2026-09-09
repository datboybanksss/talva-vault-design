CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('agency','talent')),
  version text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_type, version)
);

CREATE UNIQUE INDEX legal_documents_one_current_per_type
  ON public.legal_documents (doc_type) WHERE is_current;

GRANT SELECT ON public.legal_documents TO anon;
GRANT SELECT, INSERT, UPDATE ON public.legal_documents TO authenticated;
GRANT ALL ON public.legal_documents TO service_role;

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read the current legal documents"
  ON public.legal_documents FOR SELECT TO anon, authenticated
  USING (is_current);

CREATE POLICY "Admins can read all legal documents"
  ON public.legal_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Editing admins can add legal documents"
  ON public.legal_documents FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_edit(auth.uid()));

CREATE POLICY "Editing admins can update legal documents"
  ON public.legal_documents FOR UPDATE TO authenticated
  USING (public.can_admin_edit(auth.uid()))
  WITH CHECK (public.can_admin_edit(auth.uid()));

CREATE TRIGGER legal_documents_touch_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('agency','talent')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_type, version)
);

CREATE INDEX legal_acceptances_user_idx ON public.legal_acceptances (user_id);

GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.legal_documents (doc_type, version, title, body, is_current)
VALUES
  ('agency', 'v1.1', 'TalVault Terms & Conditions — Talent Managers',
   E'## 1. Introduction\n\nThese Terms & Conditions govern your use of the TalVault platform as a Talent Manager. By activating your workspace you agree to be bound by them.\n\n## 2. Your responsibilities\n\n- Safeguard the personal information of the Talent on your Roster and process it only for legitimate management purposes.\n- Respect the retention rules and document locks configured on the platform.\n- Keep your sign-in credentials confidential and do not share your account.\n\n## 3. Talent privacy\n\nYou may only access documents a Talent has explicitly shared with you. A Talent''s Private Vault remains private to them at all times.\n\n## 4. Audit and monitoring\n\nAll actions taken in the platform are audit logged, including the date, time, IP address and device used.\n\n## 5. Data protection\n\nYou undertake to comply with the Protection of Personal Information Act (POPIA) and any other applicable privacy legislation.\n\n## 6. Suspension\n\nTalVault may suspend or end access where these Terms are breached.\n\n## 7. Changes to these Terms\n\nWe may publish updated versions of these Terms. Continued use of the platform after a new version takes effect constitutes acceptance of that version.',
   true),
  ('talent', 'v1.1', 'TalVault Terms & Conditions — Talent',
   E'## 1. Introduction\n\nThese Terms & Conditions govern your use of the TalVault platform as a Talent. By activating your vault you agree to be bound by them.\n\n## 2. Your vault\n\nYour Private Vault is private to you. Nothing in it is visible to your Manager unless you deliberately place a document in a shared folder or share it.\n\n## 3. Sharing\n\n- Documents you file in a shared folder are visible to your Manager.\n- A Loved One share gives limited, time-bound access to the items you select. You may revoke a share at any time.\n\n## 4. Your responsibilities\n\n- Provide accurate information and keep your documents current.\n- Keep your sign-in credentials confidential and do not share your account.\n- Only upload documents you are entitled to store and share.\n\n## 5. Audit and monitoring\n\nActivity on your account is audit logged, including the date, time, IP address and device used, so that you can see who accessed what.\n\n## 6. Data protection\n\nYour personal information is processed in line with the Protection of Personal Information Act (POPIA) and our Privacy Policy.\n\n## 7. Changes to these Terms\n\nWe may publish updated versions of these Terms. Continued use of the platform after a new version takes effect constitutes acceptance of that version.',
   true);