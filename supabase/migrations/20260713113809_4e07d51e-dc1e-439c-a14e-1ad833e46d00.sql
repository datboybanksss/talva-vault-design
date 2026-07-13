
-- 1. Permission level enum + column on user_roles
DO $$ BEGIN
  CREATE TYPE public.admin_permission_level AS ENUM ('view_only', 'edit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS permission_level public.admin_permission_level NOT NULL DEFAULT 'edit';

-- 2. Helper: can this admin perform edit actions?
CREATE OR REPLACE FUNCTION public.can_admin_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND permission_level = 'edit'
  );
$$;

-- 3. admin_invitations table
CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  permission_level public.admin_permission_level NOT NULL DEFAULT 'edit',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id),
  invited_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_email_lower
  ON public.admin_invitations (lower(email));
CREATE INDEX IF NOT EXISTS idx_admin_invitations_status
  ON public.admin_invitations (status);

GRANT SELECT, INSERT, UPDATE ON public.admin_invitations TO authenticated;
GRANT ALL ON public.admin_invitations TO service_role;

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin invitations"
  ON public.admin_invitations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Main admin can insert admin invitations"
  ON public.admin_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_main_admin(auth.uid()));

CREATE POLICY "Main admin can update admin invitations"
  ON public.admin_invitations FOR UPDATE
  TO authenticated
  USING (public.is_main_admin(auth.uid()))
  WITH CHECK (public.is_main_admin(auth.uid()));

-- 4. Extend handle_new_user to auto-grant based on pending admin invitation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv RECORD;
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

  -- Honour any pending admin invitation for this email
  SELECT * INTO inv
  FROM public.admin_invitations
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, is_main_admin, permission_level)
    VALUES (NEW.id, 'admin', false, inv.permission_level)
    ON CONFLICT (user_id, role) DO UPDATE
      SET permission_level = EXCLUDED.permission_level;

    UPDATE public.admin_invitations
      SET status = 'accepted',
          accepted_at = now(),
          accepted_user_id = NEW.id
      WHERE id = inv.id;

    INSERT INTO public.admin_audit_log
      (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    VALUES
      (NEW.id, NEW.email, 'admin_invitation_accepted', 'admin_invitation',
       inv.id::text, NEW.email,
       jsonb_build_object('permission_level', inv.permission_level,
                          'invited_by', inv.invited_by_email));
  END IF;

  RETURN NEW;
END;
$$;
