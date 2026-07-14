
-- RLS on storage.objects for talent-documents bucket.
-- Path convention: <agency_id>/<talent_link_id_or_unassigned>/<uuid>-<filename>
-- Access: any active member of that agency (owner + staff).

CREATE POLICY "talent_docs_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'talent-documents'
  AND public.is_agency_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "talent_docs_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'talent-documents'
  AND public.is_agency_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "talent_docs_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'talent-documents'
  AND public.is_agency_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'talent-documents'
  AND public.is_agency_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "talent_docs_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'talent-documents'
  AND public.is_agency_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
