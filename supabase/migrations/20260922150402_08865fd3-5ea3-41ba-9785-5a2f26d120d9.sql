-- 1. Administrator suspension -------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND suspended = false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_admin_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
      AND permission_level = 'edit' AND suspended = false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_main_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
      AND is_main_admin = true AND suspended = false
  );
$$;

-- Main admin may write role rows (suspend / change level / remove).
DROP POLICY IF EXISTS "Main admin manages roles" ON public.user_roles;
CREATE POLICY "Main admin manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_main_admin(auth.uid()))
  WITH CHECK (public.is_main_admin(auth.uid()));

-- 2. Agency owners may manage their colleagues --------------------------------
DROP POLICY IF EXISTS "Owners update their agency members" ON public.agency_members;
CREATE POLICY "Owners update their agency members" ON public.agency_members
  FOR UPDATE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner') AND role <> 'owner')
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner') AND role <> 'owner');

DROP POLICY IF EXISTS "Owners remove their agency members" ON public.agency_members;
CREATE POLICY "Owners remove their agency members" ON public.agency_members
  FOR DELETE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner') AND role <> 'owner');

-- 3. Agency status must become "accepted" when the owner signs up -------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  ag_inv RECORD;
  tal_inv RECORD;
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

  SELECT * INTO ag_inv FROM public.agency_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF ag_inv.id IS NOT NULL THEN
    IF ag_inv.kind = 'agency_onboarding' THEN
      IF ag_inv.agency_id IS NULL THEN
        INSERT INTO public.agencies (name, contact_email, contact_person, status, created_by)
        VALUES (ag_inv.agency_name, NEW.email, ag_inv.contact_person, 'accepted', NEW.id)
        RETURNING id INTO new_agency_id;
        UPDATE public.agency_invitations SET agency_id = new_agency_id WHERE id = ag_inv.id;
      ELSE
        new_agency_id := ag_inv.agency_id;
        -- The shell agency record goes live the moment its owner accepts.
        UPDATE public.agencies
           SET status = 'accepted', updated_at = now()
         WHERE id = new_agency_id
           AND status IN ('incomplete', 'invited');
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

  SELECT * INTO tal_inv FROM public.talent_invitations
    WHERE lower(email) = lower(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;

  IF tal_inv.id IS NOT NULL THEN
    PERFORM public.accept_talent_invitation(tal_inv.id, NEW.id, NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: agencies whose onboarding invitation was accepted and who have an owner.
UPDATE public.agencies a
   SET status = 'accepted', updated_at = now()
 WHERE a.status IN ('incomplete', 'invited')
   AND EXISTS (
     SELECT 1 FROM public.agency_invitations i
      WHERE i.agency_id = a.id AND i.kind = 'agency_onboarding' AND i.status = 'accepted'
   )
   AND EXISTS (
     SELECT 1 FROM public.agency_members m
      WHERE m.agency_id = a.id AND m.role = 'owner'
   );

-- 4. Lock issued billing documents --------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_doc_lock_financials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.number IS DISTINCT FROM OLD.number
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      RAISE EXCEPTION 'BILLING_LOCKED: % % has been issued — its number, totals, currency and dates can no longer be changed.',
        OLD.kind, OLD.number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_doc_lock_financials ON public.agency_billing_docs;
CREATE TRIGGER billing_doc_lock_financials
  BEFORE UPDATE ON public.agency_billing_docs
  FOR EACH ROW EXECUTE FUNCTION public.billing_doc_lock_financials();

CREATE OR REPLACE FUNCTION public.billing_doc_lines_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE st doc_status; num text;
BEGIN
  SELECT status, number INTO st, num FROM public.agency_billing_docs
   WHERE id = COALESCE(NEW.doc_id, OLD.doc_id);
  IF st IS NOT NULL AND st <> 'draft' THEN
    RAISE EXCEPTION 'BILLING_LOCKED: % has been issued — its line items can no longer be changed.', num;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS billing_doc_lines_lock ON public.agency_billing_doc_lines;
CREATE TRIGGER billing_doc_lines_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_billing_doc_lines
  FOR EACH ROW EXECUTE FUNCTION public.billing_doc_lines_lock();

CREATE OR REPLACE FUNCTION public.billing_doc_block_delete_with_payments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agency_invoice_payments WHERE doc_id = OLD.id;
  IF n > 0 THEN
    RAISE EXCEPTION 'BILLING_HAS_PAYMENTS: % has % recorded payment(s). Remove the payments first, or cancel the invoice instead of deleting it.',
      OLD.number, n;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS billing_doc_block_delete_with_payments ON public.agency_billing_docs;
CREATE TRIGGER billing_doc_block_delete_with_payments
  BEFORE DELETE ON public.agency_billing_docs
  FOR EACH ROW EXECUTE FUNCTION public.billing_doc_block_delete_with_payments();

-- 5. Overdue sweep -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_overdue_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  UPDATE public.agency_billing_docs d
     SET status = 'overdue'
   WHERE d.kind = 'invoice'
     AND d.status IN ('sent', 'accepted')
     AND d.due_date IS NOT NULL
     AND d.due_date < CURRENT_DATE
     AND d.total_cents > COALESCE(
        (SELECT SUM(p.amount_cents) FROM public.agency_invoice_payments p WHERE p.doc_id = d.id), 0);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_overdue_invoices() TO authenticated, service_role;

SELECT cron.schedule('sweep-overdue-invoices', '7 * * * *', $cron$ SELECT public.sweep_overdue_invoices(); $cron$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-overdue-invoices');

-- 6. Recipient access history for shares ---------------------------------------
CREATE TABLE IF NOT EXISTS public.loved_one_share_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.loved_one_shares(id) ON DELETE CASCADE,
  document_id uuid,
  document_name text,
  event text NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loved_one_share_access_events_share_idx
  ON public.loved_one_share_access_events (share_id, created_at DESC);

GRANT SELECT ON public.loved_one_share_access_events TO authenticated;
GRANT ALL ON public.loved_one_share_access_events TO service_role;

ALTER TABLE public.loved_one_share_access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Talent read own share access events" ON public.loved_one_share_access_events;
CREATE POLICY "Talent read own share access events"
  ON public.loved_one_share_access_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loved_one_shares s
     WHERE s.id = loved_one_share_access_events.share_id
       AND s.created_by = auth.uid()
  ));

-- 7. Private Vault provisioning: stop deleting non-starter categories ----------
CREATE OR REPLACE FUNCTION public.seed_talent_private_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  -- Provision the full catalogue. (The previous version deleted every
  -- non-starter category straight after seeding, which is why recent accounts
  -- ended up with only the six starter folders.)
  PERFORM public.seed_talent_default_folders(NEW.user_id);
  RETURN NEW;
END;
$$;