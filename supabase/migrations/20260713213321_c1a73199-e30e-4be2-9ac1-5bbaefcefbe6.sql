
-- 1. Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.agency_invitation_kind AS ENUM ('agency_onboarding','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agency_talent_link_status AS ENUM
    ('active','invited','expired','read_only','revoked','needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shared_document_status AS ENUM
    ('ai_suggested','filed','needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. agency_invitations discriminator ----------------------------------
ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS kind public.agency_invitation_kind
    NOT NULL DEFAULT 'agency_onboarding';
ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS role text;  -- for staff invites: 'owner'|'manager'|'staff'

-- 3. Helper functions --------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_agency_member(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE user_id = _user_id AND agency_id = _agency_id AND suspended = false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_agency_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agency_id FROM public.agency_members
  WHERE user_id = auth.uid() AND suspended = false
  ORDER BY created_at ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_agency_role(_user_id uuid, _agency_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE user_id = _user_id AND agency_id = _agency_id
      AND role = _role AND suspended = false
  );
$$;

-- 4. agency_talent_links -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_talent_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  talent_profile_id uuid REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  talent_invitation_id uuid REFERENCES public.talent_invitations(id) ON DELETE SET NULL,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  status public.agency_talent_link_status NOT NULL DEFAULT 'invited',
  talent_type text,
  next_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agency_talent_links_agency ON public.agency_talent_links(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_talent_links_talent_user ON public.agency_talent_links(talent_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_talent_links TO authenticated;
GRANT ALL ON public.agency_talent_links TO service_role;
ALTER TABLE public.agency_talent_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read own agency talent links"
  ON public.agency_talent_links FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id) OR talent_user_id = auth.uid());
CREATE POLICY "Agency members insert own agency talent links"
  ON public.agency_talent_links FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members update own agency talent links"
  ON public.agency_talent_links FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members delete own agency talent links"
  ON public.agency_talent_links FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE TRIGGER agency_talent_links_touch_updated_at
  BEFORE UPDATE ON public.agency_talent_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. talent_shared_documents ------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_shared_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_link_id uuid REFERENCES public.agency_talent_links(id) ON DELETE CASCADE,
  name text NOT NULL,
  folder text NOT NULL DEFAULT 'Unfiled',
  status public.shared_document_status NOT NULL DEFAULT 'needs_review',
  validity_expires_at timestamptz,
  ai_suggested_folder text,
  ai_suggested_expiry timestamptz,
  storage_path text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shared_docs_agency ON public.talent_shared_documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_shared_docs_link ON public.talent_shared_documents(talent_link_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_shared_documents TO authenticated;
GRANT ALL ON public.talent_shared_documents TO service_role;
ALTER TABLE public.talent_shared_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency or talent read shared docs"
  ON public.talent_shared_documents FOR SELECT TO authenticated
  USING (
    public.is_agency_member(auth.uid(), agency_id)
    OR EXISTS (SELECT 1 FROM public.agency_talent_links l
               WHERE l.id = talent_link_id AND l.talent_user_id = auth.uid())
  );
CREATE POLICY "Agency writes shared docs"
  ON public.talent_shared_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency updates shared docs"
  ON public.talent_shared_documents FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency deletes shared docs"
  ON public.talent_shared_documents FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE TRIGGER talent_shared_documents_touch_updated_at
  BEFORE UPDATE ON public.talent_shared_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. agency_folder_templates + items ----------------------------------
CREATE TABLE IF NOT EXISTS public.agency_folder_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_folder_templates_agency ON public.agency_folder_templates(agency_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_folder_templates TO authenticated;
GRANT ALL ON public.agency_folder_templates TO service_role;
ALTER TABLE public.agency_folder_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read own templates"
  ON public.agency_folder_templates FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members write own templates"
  ON public.agency_folder_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members update own templates"
  ON public.agency_folder_templates FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));
CREATE POLICY "Agency members delete own templates"
  ON public.agency_folder_templates FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE TRIGGER agency_folder_templates_touch_updated_at
  BEFORE UPDATE ON public.agency_folder_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.agency_folder_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.agency_folder_templates(id) ON DELETE CASCADE,
  folder_name text NOT NULL,
  required_docs jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_folder_template_items_template ON public.agency_folder_template_items(template_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_folder_template_items TO authenticated;
GRANT ALL ON public.agency_folder_template_items TO service_role;
ALTER TABLE public.agency_folder_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Template items follow template access"
  ON public.agency_folder_template_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agency_folder_templates t
                 WHERE t.id = template_id
                   AND public.is_agency_member(auth.uid(), t.agency_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agency_folder_templates t
                      WHERE t.id = template_id
                        AND public.is_agency_member(auth.uid(), t.agency_id)));

-- 7. handle_new_user: honour agency onboarding + staff invitations ----
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  inv RECORD;
  ag_inv RECORD;
  new_agency_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'israel@npiconsulting.co.za' THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', true, 'edit')
    ON CONFLICT (user_id, role) DO UPDATE
      SET is_main_admin = true, permission_level = 'edit';
  END IF;

  -- Admin invitations (unchanged)
  SELECT * INTO inv FROM public.admin_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', false, inv.permission_level)
    ON CONFLICT (user_id, role) DO UPDATE SET permission_level = EXCLUDED.permission_level;

    UPDATE public.admin_invitations
      SET status = 'accepted', accepted_at = now(), accepted_user_id = NEW.id
      WHERE id = inv.id;

    INSERT INTO public.admin_audit_log
      (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES
      (NEW.id, NEW.email, 'admin_invitation_accepted', 'admin_invitation',
       inv.id::text, NEW.email,
       jsonb_build_object('permission_level', inv.permission_level,
                          'invited_by', inv.invited_by_email));
  END IF;

  -- Agency invitations (onboarding + staff)
  SELECT * INTO ag_inv FROM public.agency_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF ag_inv.id IS NOT NULL THEN
    IF ag_inv.kind = 'agency_onboarding' THEN
      -- Provision agency if not linked yet
      IF ag_inv.agency_id IS NULL THEN
        INSERT INTO public.agencies (name, contact_email, contact_person, status, created_by)
        VALUES (ag_inv.agency_name, NEW.email, ag_inv.contact_person, 'accepted', NEW.id)
        RETURNING id INTO new_agency_id;
        UPDATE public.agency_invitations SET agency_id = new_agency_id WHERE id = ag_inv.id;
      ELSE
        new_agency_id := ag_inv.agency_id;
      END IF;

      INSERT INTO public.agency_members (agency_id, user_id, role, suspended)
      VALUES (new_agency_id, NEW.id, 'owner', false)
      ON CONFLICT DO NOTHING;

    ELSIF ag_inv.kind = 'staff' AND ag_inv.agency_id IS NOT NULL THEN
      INSERT INTO public.agency_members (agency_id, user_id, role, suspended)
      VALUES (ag_inv.agency_id, NEW.id, COALESCE(ag_inv.role, 'staff'), false)
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.agency_invitations
      SET status = 'accepted', accepted_at = now()
      WHERE id = ag_inv.id;
  END IF;

  RETURN NEW;
END;
$function$;
