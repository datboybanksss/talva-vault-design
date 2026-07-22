
CREATE POLICY "Admins can read compliance docs storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agency-compliance-docs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload compliance docs storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agency-compliance-docs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete compliance docs storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agency-compliance-docs' AND public.has_role(auth.uid(), 'admin'));
