
-- 1. Folder template items: add default retention (years)
ALTER TABLE public.agency_folder_template_items
  ADD COLUMN IF NOT EXISTS default_retention_years INTEGER;

-- 2. Tighten folder-template write policies to owner-only (staff keep read)
DROP POLICY IF EXISTS "Agency members write own templates" ON public.agency_folder_templates;
DROP POLICY IF EXISTS "Agency members update own templates" ON public.agency_folder_templates;
DROP POLICY IF EXISTS "Agency members delete own templates" ON public.agency_folder_templates;

CREATE POLICY "Owners write templates" ON public.agency_folder_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));

CREATE POLICY "Owners update templates" ON public.agency_folder_templates
  FOR UPDATE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'))
  WITH CHECK (public.has_agency_role(auth.uid(), agency_id, 'owner'));

CREATE POLICY "Owners delete templates" ON public.agency_folder_templates
  FOR DELETE TO authenticated
  USING (public.has_agency_role(auth.uid(), agency_id, 'owner'));

-- Tighten template items too — read follows membership, write follows owner role.
DROP POLICY IF EXISTS "Template items follow template access" ON public.agency_folder_template_items;

CREATE POLICY "Members read template items" ON public.agency_folder_template_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agency_folder_templates t
    WHERE t.id = template_id AND public.is_agency_member(auth.uid(), t.agency_id)
  ));

CREATE POLICY "Owners write template items" ON public.agency_folder_template_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agency_folder_templates t
    WHERE t.id = template_id AND public.has_agency_role(auth.uid(), t.agency_id, 'owner')
  ));

CREATE POLICY "Owners update template items" ON public.agency_folder_template_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agency_folder_templates t
    WHERE t.id = template_id AND public.has_agency_role(auth.uid(), t.agency_id, 'owner')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agency_folder_templates t
    WHERE t.id = template_id AND public.has_agency_role(auth.uid(), t.agency_id, 'owner')
  ));

CREATE POLICY "Owners delete template items" ON public.agency_folder_template_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agency_folder_templates t
    WHERE t.id = template_id AND public.has_agency_role(auth.uid(), t.agency_id, 'owner')
  ));

-- 3. Billing docs: add missing operational columns and agency-scoped CRUD policies
ALTER TABLE public.agency_billing_docs
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS talent_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_billing_docs_updated_at ON public.agency_billing_docs;
CREATE TRIGGER trg_billing_docs_updated_at
  BEFORE UPDATE ON public.agency_billing_docs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Agency members read billing docs" ON public.agency_billing_docs
  FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members insert billing docs" ON public.agency_billing_docs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members update billing docs" ON public.agency_billing_docs
  FOR UPDATE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Agency members delete billing docs" ON public.agency_billing_docs
  FOR DELETE TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id));
