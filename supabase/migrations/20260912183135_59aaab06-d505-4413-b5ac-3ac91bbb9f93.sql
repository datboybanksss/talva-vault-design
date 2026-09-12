GRANT UPDATE ON public.agencies TO authenticated;

CREATE POLICY "Agency owners can update their agency"
ON public.agencies
FOR UPDATE
TO authenticated
USING (public.has_agency_role(auth.uid(), id, 'owner'))
WITH CHECK (public.has_agency_role(auth.uid(), id, 'owner'));