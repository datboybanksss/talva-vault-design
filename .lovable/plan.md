# Independent talent (invite-only) — implementation plan

## Verified current state (read this turn)
- **Self-sign-up:** `/auth` has a "sign-up" mode, but submitting it only shows "Accounts are created from an invitation only" — it never calls `supabase.auth.signUp`. No other `signUp(` call exists in `src/`. **Gap:** the backend's own sign-up setting has not been checked. Anyone who calls the public auth endpoint directly could still create a bare account. Fix: switch off sign-ups in the auth settings (invites use `auth.admin.createUser`, which keeps working), and remove the dead sign-up mode from `/auth`.
- **`talent_invitations.agency_id` is NOT NULL.** RLS: admins ALL; agency members SELECT; agency owners ALL.
- **`talent_profiles.agency_id` is nullable.** 0 of 11 profiles have no agency.
- **`accept_talent_invitation`** always inserts or updates an `agency_talent_links` row and calls `provision_talent_folders(inv.agency_id, …)`. A null agency would fail on the link insert, because `agency_talent_links.agency_id` is NOT NULL.
- **`agency_compliance_documents`** is keyed by `invitation_id` (NOT NULL) and has admin-only RLS. It is tied to `agency_invitations`.
- **`talent_shared_documents`** has `retention_years_at_upload`, `retention_stamped_at`, `locked_until` and `uploaded_by`, but no originator field. Talent can SELECT through their link. Only agency members can write, and writes are blocked once a link has ended.
- **`loved_one_shares`** already covers: no-account recipients, an emailed link (`email_sent_at`), an access code stored hashed (`access_code_hash`), lockout after failed attempts, expiry, revoke, scope (jsonb), permission, `share_kind`, view count, and an access-event log. RLS: `created_by = auth.uid()`. **Gaps:** the "relationship" options are framed around family; the copy and file names say "Loved One"; access history is still unverified live.
- **2FA bypass (item a):** `src/lib/mfa.functions.ts` has two parts. One is an email allowlist (`MFA_TEST_BYPASS_EMAILS`). The other is `MFA_TEST_BYPASS_ALL = true`, which returns `gate: "ok"` for every account on preview and live. **This directly conflicts with "mandatory 2FA, no exemptions".** The commit titles you quoted map to these two changes. I could not see git history, so I can't confirm which commit added which part.

## What changes

### 0. Prerequisites
- Remove both bypass paths from `mfa.functions.ts`, and delete the `MFA_TEST_BYPASS_EMAILS` secret if it exists. This happens first and is not optional, per your standing rule.
- Turn off backend sign-ups and remove the sign-up mode from `/auth`.

### 1. Admin invites talent directly
- Mirror the agency draft flow: create the draft, edit it, upload 2 documents (ID + proof of talent), then a send gate. Includes inline helper text, a case-insensitive duplicate-filename check on both the page and the server, and file-type checks that read the file's actual contents (magic bytes) using the existing `file-validation.server.ts`.
- Date of birth is collected on the invite and again at activation. Activation refuses anyone under 18, with the message: "TalVault is for adults (18 and over) at this stage. Please contact the administrator who invited you."
- Reuse the existing invite email, acceptance, terms, emailed-code 2FA and activation steps.
- New admin screen: `/admin/invitations/new-talent` (draft form + uploads). It loads an existing draft the same way "Load Agency" does.

### 2. Agency-invited talent: no behaviour change
Regression tests only.

### 3. Agency requests to link an existing talent
- On the agency side, "Invite talent" first checks the email address. If a talent account already exists, it creates an `agency_talent_links` row in `invited` and sends a link request instead of a new invitation.
- The talent gets a bell notification and a new "Agency requests" view (`/talent/requests`) with Accept and Decline buttons. Accepting sets the link to `active` and sets up that agency's folders. Declining sets it to `revoked` and records who declined and when.
- Multiple agencies per talent are already supported by the schema.

### 4. Talent-controlled sharing (originator)
- New column `talent_shared_documents.originator` (`agency` | `talent`, default `agency`). Existing rows are backfilled from `uploaded_by` (the talent's user = talent).
- When `originator = 'talent'`: retention locks, `locked_until` and folder rules are skipped. The talent can revoke at any time. The agency can view but cannot delete or edit.
- Enforced in RLS (new talent UPDATE/DELETE policy limited to talent-originated rows on their own link), in the retention triggers (`tsd_after_insert_refresh_lock`, `tsd_protect_retention_lock`, `enforce_retention_lock_delete` skip talent rows), and in the server functions.

### 5. Ending a relationship
- Already in place (verified in an earlier audit): the SELECT policy survives the `ended` status, writes are blocked, and the retention stamp is stored at upload.
- Add a talent-side read cut-off: once `ended_at + retention_years_at_upload` has passed, the talent can no longer read agency-originated documents. Talent-originated documents are never cut off.

### 6. Private Vault sharing for everyone
- Use `loved_one_shares` as it is. Widen the relationship options (Family, Banker, Financial adviser, Accountant, School, Legal, Other) and make sure independent talent (no agency) can create shares.
- No new table is needed.

### 7. Rename "Loved One" — options for you to choose (not picked)
1. **Trusted contact**
2. **Secure share** (recipient: "share recipient")
3. **Shared access** (recipient: "guest viewer")

Affects copy in: talent.sharing, talent.settings, talent.index, auth, forgot/reset-password, __root, agency.document-vault, invite.talent, tours registry, reminders, email templates, and the admin dashboard.
**Internal names** (`loved_one_shares`, the `loved_one` role, `/loved-one/$token`, `/api/public/loved-one-file`): **I recommend keeping them.** Renaming the tables and role is a breaking migration, and the link format in emails already sent would change. If a rename is wanted later, it can be done as a separate, deliberate change.

### 8. No Quotes & Invoices for independent talent
- Hide the talent "Budget & Income" menu item when the talent has no active agency link.
- `listTalentBillingDocuments` and any talent billing reads return an empty result or a refusal on the server when there are no links. Billing-table RLS is already agency-scoped, so it keeps blocking.

### 9. Talent portal with zero agencies
- `getTalentContext` returns `agencies: []` and `tier: "standard"` (a placeholder hook for future tiers, not built).
- Dashboard, shell menu, vault, notifications and tours hide agency-only panels instead of showing empty or error states. The "Agency shared folder" panel is replaced by the Private Vault and the Requests view.

## Admin dashboard wording (for your approval)
- Title and H1 both: **"Platform overview"**.
- KPI cards:
  - Total agencies
  - **Open invitations**, with a sub-line "{n} agency · {m} talent"
  - **Talent onboarded**, with a sub-line "{a} agency-linked · {i} independent"
  - **Pending link requests** (agency → existing talent)
  - Total documents uploaded
  - **Active {chosen term}s** (from item 7)
  - Suspended agencies
- Tables: "Agency onboarding overview" (unchanged) plus a new **"Talent invitations overview"** with status chips and Load more.
- Actions: "Invite an agency" and **"Invite talent"**. Empty state: "No agencies or talent on the platform yet. Invite an agency or invite talent to get started."
- `/admin/invitations`: a combined list with a **Type** filter (All / Agency / Talent) and the kebab row actions menu.
- `/admin/reporting`: an independent vs agency-linked split for talent counts, documents and engagement. All counts come from real queries.

## Technical details

**Migration A — independent talent invites**
- `talent_invitations.agency_id` DROP NOT NULL. Add `invited_by_admin boolean default false`, `date_of_birth date`, `talent_type` (already present) and `draft` status support (the enum already has `draft`).
- New table `talent_invitation_documents` (id, invitation_id FK, doc_slot `id_document|proof_of_talent`, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at). Unique index on (invitation_id, doc_slot) and on (invitation_id, lower(file_name)). GRANTs to authenticated and service_role. RLS: admin-only SELECT/INSERT/DELETE through `has_role`.
- Storage: a private `talent-invite-docs` bucket with admin-only object policies (same pattern as compliance documents).
- Replace `accept_talent_invitation`: when `inv.agency_id IS NULL`, create the profile with no agency, skip the link and agency folders, and still call `seed_talent_default_folders`.
- Rollback: restore the previous function definition, drop the new table, bucket and columns, and set `agency_id` back to NOT NULL. The NOT NULL step is only safe if no null rows exist, so delete or convert those rows first.

**Migration B — link requests**
- `agency_talent_links`: add `requested_at`, `responded_at`, `declined_at`, `request_kind` (`invite|link_request`).
- New talent RLS policy: UPDATE on own link rows where `status = 'invited'` and `request_kind = 'link_request'`, with the change limited to `active` or `revoked`. Enforce this with a SECURITY DEFINER function `respond_link_request(_link_id, _accept bool)` instead of broad UPDATE rights.
- Add the `link_request` value to `talent_notifications` kind (it is a text column, so no enum change).
- Rollback: drop the function, the policy and the new columns.

**Migration C — originator**
- `talent_shared_documents.originator text not null default 'agency' check in ('agency','talent')`, plus the backfill.
- Policies: "Talent manage own originated docs" for UPDATE/DELETE where `originator='talent'` and the link belongs to `auth.uid()`. Add `originator='agency'` to the agency UPDATE/DELETE policies (agency can still read).
- Update the 3 retention triggers to return early for talent rows. Add a talent read cut-off check to the SELECT policy.
- Rollback: restore the previous trigger and policy definitions, then drop the column.

**Server functions**
- `admin.functions.ts`: `createTalentInvitationDraft`, `updateTalentInvitationDraft`, `listTalentInvitationDocuments`, `recordTalentInvitationDocument`, `deleteTalentInvitationDocument`, `finalizeTalentInvitation` (completeness gate), `listTalentInvitationsPaged`. Extend `getDashboardMetrics`, `listNotifications`, `resendInvitation` and `revokeInvitation` to handle the talent kind.
- `talent-activation.functions.ts`: require `date_of_birth`, block under-18s, skip billing and links for independent talent.
- `agency.functions.ts`: `inviteOrRequestTalentLink` (email match), plus a cancel-request action.
- `talent.functions.ts`: `listLinkRequests`, `respondLinkRequest`, a zero-agency `getTalentContext`, a billing guard, and `revokeTalentOriginatedDocument`.
- `loved-one.functions.ts`: widen the relationship validation and allow talent with no agency.
- `admin-reporting.functions.ts`: an independent/linked split.
- `invitation-email.ts`: a talent template variant for admin invites with no agency name ("TalVault has invited you").

**Routes and components**
- New: `admin.invitations.new-talent.tsx`, `talent.requests.tsx`.
- Edited: `admin.index.tsx`, `admin.invitations.index.tsx`, `admin.reporting.tsx`, `admin-shell.tsx`, `invite.talent.$token.tsx`, `talent-shell.tsx`, `talent.index.tsx`, `talent.budget.tsx`, `talent.sharing.tsx`, `talent.vault.tsx`, `agency.talent.invite.tsx`, `agency.talent.index.tsx`, `auth.tsx`, `mfa.functions.ts`, `tours/registry.ts` (new tour steps for the two new screens), plus the copy files listed in item 7.

## (b) Sending domain
All new emails (admin talent invite, link request, share link) depend on `notify.talvault.com`, which is still unverified. Until it is verified, every flow shows the existing copy-the-link fallback, and the bell notification works without email. Link requests stay usable in-app.

## (d) Test checklist (each with a database check, run in transactions that roll back)
1. Sign-up off: calling auth sign-up directly is refused; `auth.users` count is unchanged.
2. 2FA: no `MFA_TEST_BYPASS` in `src/`; a new session returns `gate: "challenge"`.
3. Admin talent draft cannot be finalised with fewer than 2 documents; a duplicate filename is refused by the unique index; a fake PDF is refused.
4. Accepting a talent invite with no agency creates a `talent_profiles` row with `agency_id IS NULL`, 0 links and 19 private folders.
5. Activation with date of birth under 18 is refused, and no `auth.users` row is created.
6. Agency invite regression: the link becomes `active` and the agency folders are set up.
7. Link request: an `invited` row is created; accept leads to `active`; decline leads to `revoked` with `declined_at`; a second agency link coexists with the first.
8. Talent-originated document: the talent can DELETE it while `locked_until` is in the future; the agency's DELETE affects 0 rows.
9. Agency document after the link has ended: talent SELECT works within retention and returns 0 rows after the cut-off; talent-originated documents are still visible.
10. Share creation by independent talent works; `loved_one_share_access_events` records rows when a share is opened.
11. Independent talent calling `listTalentBillingDocuments` gets an empty result or a refusal; the Budget menu item is hidden.
12. Zero-agency talent: dashboard, vault and notifications load with no errors in the console logs.
13. Admin dashboard: each KPI matches a direct `count(*)` query; the Type filter on `/admin/invitations` returns both kinds.
14. RLS: an agency member cannot read `talent_invitation_documents`; a talent cannot respond to another talent's request.

## Open decisions for you
- The replacement term for "Loved One" (item 7).
- Approval of the dashboard wording above.
