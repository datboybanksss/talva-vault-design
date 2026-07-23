
-- Files are stored at path: {agency_id}/{filename}
-- (owner column can be null when uploaded via server-fn, so we scope by folder prefix)

CREATE POLICY "agency members read own branding"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'agency-branding'
    AND (
      public.is_agency_member(auth.uid(), (split_part(name, '/', 1))::uuid)
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "agency members insert own branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agency-branding'
    AND public.is_agency_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "agency members update own branding"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'agency-branding'
    AND public.is_agency_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "agency members delete own branding"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'agency-branding'
    AND public.is_agency_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
