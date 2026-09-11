# Block duplicate compliance document names per agency draft

When an admin uploads a compliance document for an agency onboarding draft, the system will refuse a file whose name matches one already uploaded for that same draft — regardless of which document slot it was uploaded into.

## Behaviour

- The check compares the file name ignoring capitalisation and surrounding spaces, so `ID Copy.pdf` and `id copy.PDF` count as the same document.
- It only looks at documents already attached to the agency invitation currently open; other agencies are unaffected.
- If a match is found, the file is not uploaded and a short message appears directly beneath the affected upload row: "A document named '<file name>' has already been uploaded for this agency."
- The message clears as soon as the admin picks a different file or successfully uploads.
- Nothing is stored, so no stray file is left behind when an upload is rejected.

## Technical details

**Client — `src/routes/admin.invitations.new.tsx`**
- Before the storage upload in `uploadForSlot`, compare the chosen file's name against the already-loaded `docs` list (which covers all slots for the draft) using a normalised `trim().toLowerCase()` comparison.
- On a match, set a per-slot error in new state (`slotErrors: Record<string, string>`) and return early — no storage call, no server call.
- Render the message inline under the slot row using the existing muted/danger text style; clear the entry on a new file selection and on a successful upload.
- The stale-doc list (documents from a previously chosen business type) is part of `docs`, so those names also count as duplicates, matching the "across all slots" requirement.

**Server — `recordComplianceDocument` in `src/lib/admin.functions.ts`**
- Authoritative re-check after the existing validation and before the insert: select `id, file_name` from `agency_compliance_documents` where `invitation_id = data.invitation_id`, and compare normalised names in the handler (case-insensitive, avoids relying on a DB collation).
- If a duplicate exists, remove the just-uploaded object from the `agency-compliance-docs` bucket so no orphan remains, then throw `A document named "<file name>" has already been uploaded for this agency.` The client surfaces that message inline for the slot rather than as a toast.

No schema change, no seeded or hardcoded values — the check reads live records for the open draft.
