CREATE POLICY "Members see their agency team"
ON public.agency_members
FOR SELECT
TO authenticated
USING (public.is_agency_member(auth.uid(), agency_id));