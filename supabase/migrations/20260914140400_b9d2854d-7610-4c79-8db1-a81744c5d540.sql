CREATE POLICY "Admins read talent links"
ON public.agency_talent_links
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));