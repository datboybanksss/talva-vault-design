
-- =========================================================
-- ROLES
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'agency_owner', 'agency_member', 'talent', 'loved_one');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  is_main_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER role check (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_main_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin' AND is_main_admin = true);
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins see all roles" ON public.user_roles FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT
  TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- On signup: create profile + auto-grant admin to seed email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'israel@npiconsulting.co.za' THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin)
    VALUES (NEW.id, 'admin', true)
    ON CONFLICT (user_id, role) DO UPDATE SET is_main_admin = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- AGENCIES
-- =========================================================
CREATE TYPE public.agency_status AS ENUM ('incomplete', 'invited', 'accepted', 'expired', 'declined', 'suspended');

CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_person TEXT,
  phone TEXT,
  country TEXT,
  status public.agency_status NOT NULL DEFAULT 'incomplete',
  suspension_reason TEXT,
  suspended_at TIMESTAMPTZ,
  suspended_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agencies" ON public.agencies FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_agencies_touch BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- AGENCY MEMBERS
-- =========================================================
CREATE TABLE public.agency_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  suspended BOOLEAN NOT NULL DEFAULT false,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_members TO authenticated;
GRANT ALL ON public.agency_members TO service_role;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agency members" ON public.agency_members FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own membership" ON public.agency_members FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- INVITATIONS
-- =========================================================
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'declined', 'revoked');

CREATE TABLE public.agency_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  agency_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  supporting_docs JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_invitations TO authenticated;
GRANT ALL ON public.agency_invitations TO service_role;
ALTER TABLE public.agency_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agency invitations" ON public.agency_invitations FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_agency_invitations_touch BEFORE UPDATE ON public.agency_invitations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.talent_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_name TEXT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_invitations TO authenticated;
GRANT ALL ON public.talent_invitations TO service_role;
ALTER TABLE public.talent_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage talent invitations" ON public.talent_invitations FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_talent_invitations_touch BEFORE UPDATE ON public.talent_invitations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- TALENT (for onboarding count)
-- =========================================================
CREATE TABLE public.talent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  is_test BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_profiles TO authenticated;
GRANT ALL ON public.talent_profiles TO service_role;
ALTER TABLE public.talent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read talent" ON public.talent_profiles FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- AGENCY DOCUMENTS (read-only aggregate for admin, BR-QI-002)
-- =========================================================
CREATE TABLE public.agency_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  shared_folder_count INTEGER NOT NULL DEFAULT 0,
  private_vault_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id)
);

GRANT SELECT ON public.agency_documents TO authenticated;
GRANT ALL ON public.agency_documents TO service_role;
ALTER TABLE public.agency_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read agency documents" ON public.agency_documents FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- QUOTES / INVOICES (read-only aggregate reporting only)
-- =========================================================
CREATE TYPE public.doc_kind AS ENUM ('quote', 'invoice');
CREATE TYPE public.doc_status AS ENUM ('draft', 'sent', 'accepted', 'paid', 'overdue', 'cancelled');

CREATE TABLE public.agency_billing_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind public.doc_kind NOT NULL,
  number TEXT NOT NULL,
  client_name TEXT,
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  total_cents BIGINT NOT NULL DEFAULT 0,
  status public.doc_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agency_billing_docs TO authenticated;
GRANT ALL ON public.agency_billing_docs TO service_role;
ALTER TABLE public.agency_billing_docs ENABLE ROW LEVEL SECURITY;

-- BR-QI-002: strict admin read-only, no write policy
CREATE POLICY "Admins read billing docs" ON public.agency_billing_docs FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- LOVED ONE SHARES
-- =========================================================
CREATE TABLE public.loved_one_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  loved_one_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loved_one_shares TO authenticated;
GRANT ALL ON public.loved_one_shares TO service_role;
ALTER TABLE public.loved_one_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read loved one shares" ON public.loved_one_shares FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- AUDIT LOG
-- =========================================================
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit" ON public.admin_audit_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert audit" ON public.admin_audit_log FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

-- =========================================================
-- NOTIFICATIONS (bell)
-- =========================================================
CREATE TYPE public.notif_kind AS ENUM (
  'invite_expiring', 'invite_expired', 'agency_incomplete',
  'talent_invite_pending', 'suspended_review', 'legal_copy_review'
);

CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.notif_kind NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  target_type TEXT,
  target_id TEXT,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_notifications_created ON public.admin_notifications (created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notifications" ON public.admin_notifications FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update notifications" ON public.admin_notifications FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert notifications" ON public.admin_notifications FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- LEGAL / COPY REVIEW ITEMS (BR-BELL-006)
-- =========================================================
CREATE TYPE public.legal_status AS ENUM ('placeholder', 'in_review', 'approved');

CREATE TABLE public.legal_copy_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  status public.legal_status NOT NULL DEFAULT 'placeholder',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.legal_copy_items TO authenticated;
GRANT ALL ON public.legal_copy_items TO service_role;
ALTER TABLE public.legal_copy_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage legal copy" ON public.legal_copy_items FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_legal_copy_touch BEFORE UPDATE ON public.legal_copy_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
