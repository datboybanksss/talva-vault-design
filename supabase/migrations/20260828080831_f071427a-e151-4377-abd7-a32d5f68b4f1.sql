DROP POLICY IF EXISTS "Main admin can insert admin invitations" ON public.admin_invitations;
DROP POLICY IF EXISTS "Main admin can update admin invitations" ON public.admin_invitations;

CREATE POLICY "Full admins can insert admin invitations"
ON public.admin_invitations
FOR INSERT
TO authenticated
WITH CHECK (public.can_admin_edit(auth.uid()));

CREATE POLICY "Full admins can update admin invitations"
ON public.admin_invitations
FOR UPDATE
TO authenticated
USING (public.can_admin_edit(auth.uid()))
WITH CHECK (public.can_admin_edit(auth.uid()));