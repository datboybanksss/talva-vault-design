CREATE POLICY "Agency members can view their agency"
ON public.agencies FOR SELECT TO authenticated
USING (public.is_agency_member(auth.uid(), id));