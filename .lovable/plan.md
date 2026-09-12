# Fix: "Cannot coerce the result to a single JSON object" on Agency Profile

## What's happening

The error appears when saving on Settings > Profile (either "Save profile" or
"Save main contact"), not when the tab loads. The read that fills the form is
already written safely and returns the correct single agency row.

The save fails because the database does not allow agency members to update
their own agency record. Checked in the database: the `agencies` table has a
read rule for members and a full-access rule for platform admins, but no update
rule for agency users at all. So the update changes zero rows, and the code then
asks for exactly one updated row back — which produces the red error message.

Net effect today: an agency owner can never save their agency profile or main
contact details. This is a permissions gap, not a display bug.

## The fix

1. Database: allow an agency owner to update their own agency record, scoped to
   that agency only, and grant the matching table privilege. Admin and member
   read behaviour stays exactly as it is. No other table or column is touched.
2. Server code: return the updated row tolerantly and, if no row comes back,
   raise a plain-language message ("You do not have permission to update this
   agency profile.") instead of the raw database wording.
3. Leave the profile read as-is — it already handles a missing record.

## Technical detail

Migration on `public.agencies`:

- `CREATE POLICY "Agency owners can update their agency" ON public.agencies FOR UPDATE TO authenticated USING (public.has_agency_role(auth.uid(), id, 'owner')) WITH CHECK (public.has_agency_role(auth.uid(), id, 'owner'));`
- `GRANT UPDATE ON public.agencies TO authenticated;` (RLS still gates every row.)

Restricting to the `owner` role matches the only role currently present in
`agency_members`; staff/lead roles stay read-only on agency identity fields.

In `src/lib/agency.functions.ts`, `updateMyAgencyProfile` and
`updateMyAgencyMainContact`: swap `.select().single()` for
`.select().maybeSingle()` and throw the permission message when the result is
null. No UI changes; the existing toasts will surface the clearer wording.

## Verification

- Confirm an agency owner can save both cards and the values persist on reload.
- Confirm a non-owner agency member cannot update the agency record.
- Confirm the audit entries for profile and main-contact updates still write.
