# Keep saved agency drafts editable

## What happens today

On the Load Agency / New Agency Invitation screen, the admin fills in agency name, contact person, contact email, business type and expiry, then saves a draft. From that moment the whole details section is switched off — the form is deliberately locked once a draft id exists — and the only remaining actions are uploading compliance documents and sending. Re-opening a draft from the invitations list has the same effect: the fields show the saved values but cannot be changed.

Two things cause this:

1. The details section is disabled as soon as a draft exists.
2. There is no save path for an existing draft — only "create draft" and "send". Creating also runs a duplicate-email check that would reject a re-save of the same draft.

## What will change

- The details section stays editable after a draft is saved, and after re-opening a draft.
- All captured values, including the phone number captured in the second part, are pre-filled when a draft is re-opened.
- The button becomes "Save draft" and can be used as many times as needed; it saves whatever has been captured so far without sending anything.
- A "Send invitation" action stays disabled until every required document and field is present, with plain helper text beneath it naming what is still outstanding (no banner).
- Changing the business type after documents were uploaded against the previous type is handled: documents for slots that no longer apply are listed as no longer required, and the send check only looks at slots for the current type.
- Draft counts on the invitations screen keep coming from the database as they do now; nothing is hardcoded.
- Copy uses UK/South African spelling ("finalise", "organisation").

## Technical detail

`src/lib/admin.functions.ts`
- Add `updateAgencyInvitationDraft` (POST, `requireSupabaseAuth`, `assertAdminCanEdit`): input `{ id, agency_name?, contact_person?, email?, business_type?, expiry_days?, registered_contact_number?, registered_mobile_number? }`. Rejects unless the row's `status` is `draft`. Updates `agency_invitations` and mirrors name/contact/email/business_type onto the linked `agencies` shell row. Recomputes `expires_at` from `expiry_days` when supplied. Duplicate-email check excludes the draft's own id and its own agency. Writes an `update_agency_invitation_draft` audit entry with the changed keys.
- Leave `createAgencyInvitationDraft` and `finalizeAgencyInvitation` behaviour intact; `finalize` continues to accept the phone fields.

`src/routes/admin.invitations.new.tsx`
- Remove `disabled={!!draftId}` from the details fieldset and the associated dimming; keep it enabled in both create and edit modes.
- Replace the render-time hydration (`hydratedRef` with `setState` during render) with a `useEffect` keyed on the fetched draft row, so re-opening reliably fills every field including `registered_contact_number` / `registered_mobile_number`.
- Always render the footer action: "Save draft" when nothing is saved yet (calls create), "Save draft" again afterwards (calls update), enabled whenever required base fields are filled and a save is not in flight.
- Show the compliance section as soon as a business type is chosen and a draft id exists; recompute `missingSlots` from the currently selected business type. Files stored under a slot that is not in the current type's list are shown as "no longer required" with a remove action.
- Keep the send button gated by `canSend`; replace the amber outstanding-items box with plain helper text under the button.
- Step indicator wording updated to reflect that step one remains editable.

No schema migration is required — `agency_invitations` already holds every field involved.
