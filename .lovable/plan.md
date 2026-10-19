# Document filing when AI is skipped, fails or is switched off

## Current behaviour (verified in code and database)

- No document-reading AI exists yet. The filing review uses a guess from the file name only (`suggestFromFileName`), and it runs in the browser.
- The text "Automatic analysis could not be completed" is not in the current code or on the live site's home page.
- The "Suggested by AI" badge appears whenever the file-name guess matched a folder or a date.

1. Skip for now
   - (a) Talent Private Vault: the document is saved (`pending_review = true`). It is listed in the vault table with a "Pending review" pill and appears under the "Pending review" filter. Its menu offers Finish filing review, Download and Delete. **There is no View or preview action.**
   - (b) Agency upload to talent: the document is saved (`pending_review = true`) and appears under the "Pending review" tab. Its menu offers View, Download and Finish filing review.
   - (b) Talent side: the talent's agency-shared list does not filter on `pending_review`, so the talent can already see it, but with no pending marker.
2. Visibility (RLS)
   - Private documents: `auth.uid() = user_id` only, so they stay private.
   - Shared documents: the agency reads them through its folder access, and the talent reads them through `talent_can_read_shared_doc`. Agency writes are already blocked by the "Suspended agency read-only" and "Terms not accepted" policies.
   - Both rules are already enforced by RLS and the server.
3. AI opt-out
   - No opt-out setting exists for talent or agency staff.
   - The server never calls AI.
   - `ai_assisted` is written only to the agency audit log. Nothing on the document rows records whether a value was AI-suggested or entered by the user.
   - Agency filing drops the reminder date: the shared documents table has no reminder column, so only the expiry is saved.
4. Wrong badges
   - The failed-analysis state cannot be reproduced from current code.
   - The badge logic is still loose: `suggested` is true whenever the file-name guess returned anything, and both fields start labelled as AI.

## Proposed changes

Screens:
- Shared modal gets an explicit mode: `ai` (suggestion succeeded), `failed`, or `manual` (opt-out, or no suggestion).
  - In `failed` and `manual` mode: no badges, no "Where did this come from?" link and no confidence label. Folder starts empty, or on the folder the document was uploaded into, with no expiry and the portal's default reminder days.
  - Failure is shown with the existing neutral muted helper line, not an amber banner.
  - The file-name guess counts as `ai` only when it actually matched something. Each field is labelled AI only while it is untouched.
- Talent Private Vault: add "View document" (the existing preview dialog) to every row, including pending ones.
- Talent agency-shared list: show the shared "Pending review" pill on agency uploads not yet filed. View and download only; the talent cannot file them.
- Settings: an "Organise documents with AI" switch.
  - Talent: on the Settings, Preferences card.
  - Agency: on Agency settings, as an agency-wide switch (owners only).
  - When off, the modal opens in manual mode and no suggestion is requested.
- Pending review keeps the same folder, subfolder, expiry and reminder modal. Skip for now stays available in every mode.

Server:
- `getFilingCatalog` returns `aiEnabled` from the setting. The future suggestion call (and the file-name guess) runs only when it is on, and failures come back as `analysis: "failed"`.
- `confirmDocumentFiling` stores per-field provenance: `folder_source` and `expiry_source` (`ai` or `user`). It refuses `ai` when AI is off or the analysis failed.
- Agency filing saves `reminder_at`.
- Talent filing gets an audit entry in `talent_audit_log`.
- Reminders job: read the agency `reminder_at` too, so a manual expiry feeds the same Expiring soon list and bell as an AI one. It already uses `expires_at` / `validity_expires_at`, whatever their source.

Database (guarded migration with rollback SQL):
- `talent_profiles.ai_filing_enabled boolean default true`
- `agencies.ai_filing_enabled boolean default true`
- `talent_private_documents.folder_source` and `.expiry_source` (text, check `ai`/`user`, nullable)
- `talent_shared_documents.reminder_at`, `.folder_source`, `.expiry_source`
- RLS: no new policies needed. Existing owner, agency, suspended and Terms policies cover the new columns. The agency switch is changed only through the owner-checked server function.

Tests:
- The modal shows no badges in failed or manual mode.
- Saved sources are `user` when AI is off.
- Skip keeps the document listed and openable.
- The reminder query includes a manual agency expiry.

## Decisions needed

1. Agency opt-out: agency-wide (owner sets it), or per staff member?
2. Default for new users: AI on, or off until they opt in?
3. In failed or manual mode, should the folder start empty (forcing a choice) or on the folder the document was uploaded into?
4. Should the file-name guess still count as "AI" while no real document AI exists, or should badges stay off until the real service is connected?
5. Please re-send the screenshot of the "Automatic analysis could not be completed" screen, and say whether it was the live site or the preview. I couldn't find that text in current code.
