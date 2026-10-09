# Independent talent (invite-only): implementation plan (rev 2)

## Verified current state (read from live code and database)
- **Self-sign-up.** The sign-in page has a "sign-up" mode, but submitting it only shows "Accounts are created from an invitation only". It never calls the account-creation endpoint. No other self-sign-up call exists in `src/`. **Gap:** the backend auth setting that allows sign-ups has not been checked. Someone calling the public auth endpoint directly could create a bare account. Fix: turn backend sign-ups off and remove the dead sign-up mode from `/auth`. Every invite already creates accounts via `auth.admin.createUser`, which still works with sign-ups off.
- **Invitations table.** `talent_invitations.agency_id` is NOT NULL. RLS: admins have full access, agency members can read, agency owners have full access.
- **Talent profiles.** `talent_profiles.agency_id` is nullable. 0 of 11 profiles currently have no agency.
- **Invite acceptance.** `accept_talent_invitation` always writes an `agency_talent_links` row (whose `agency_id` is NOT NULL) and provisions agency folders. A null agency would fail. It is called from `handle_new_user` on account creation.
- **Agency compliance documents.** `agency_compliance_documents` is keyed by `invitation_id` (NOT NULL) and is admin-only.
- **Shared documents.** `talent_shared_documents` has `retention_years_at_upload`, `retention_stamped_at`, `locked_until` and `uploaded_by`. There is no originator field. Talent can read through their link. Writes are agency-only and blocked once a link is ended, revoked or expired.
- **Talent Quotes & Invoices.** `listTalentBillingDocuments` reads only the talent's **first** link and matches invoices by `talent_name ILIKE display_name`. That is fragile, and it ignores a second agency. This is a pre-existing gap the plan fixes.
- **Loved One sharing** (`loved_one_shares`) already has: no-account recipients, a link emailed by TalVault, a hashed access code, lockout after failed attempts, expiry, revoke, scope, permission, view count, and an access-event log. `buildRegeneratedCodeEmail` currently **emails a new access code** to the recipient. That conflicts with "the talent sends the password separately", so it is a gap to close.
- **Existing email builders:** invitation variants (agency, talent, staff, admin) in `invitation-email.ts`; the sign-in code email in `mfa.server.ts`; the share email and the regenerated-code email in `loved-one-email.server.ts`; reminder emails in `talent-notification-email.server.ts`. All of them use `brand-email.ts`. No email builder for "invitation expired" or "invitation revoked" was found.
- **2FA bypass.** `src/lib/mfa.functions.ts` contains `MFA_TEST_BYPASS_ALL = true`, which skips 2FA for every account on preview and live. It also has an email allowlist (`MFA_TEST_BYPASS_EMAILS`). Both conflict with "mandatory 2FA, no exemptions". The 29 September commit titles match these two changes; git history itself could not be read to confirm which commit added which.
- **Sending domain.** `notify.talvault.com` is configured but unverified, so every email send currently fails and the copy-the-link fallback is shown.

## Placeholders
- `{SHARE_TERM}` and `{SHARE_RECIPIENT_TERM}` live in a single new constant file, `src/lib/terms.ts`. Every screen, email and tour reads from it, so the final choice is a one-line change.
- Internal names (`loved_one_shares`, the `loved_one` role, `/loved-one/$token`, `/api/public/loved-one-file`) stay as they are. Renaming them is a breaking change and would alter links already sent.
- Candidate terms for the decision: "Trusted contact", "Secure share", "Shared access".

## Access rules (enforced in RLS and on the server, not only in the UI)
- Only an **agency** can link an existing talent to itself. **Admins cannot attach talent to an agency.** Admin-invited talent always start independent. **Talent have no "request to join" action.**
- The new `request_link` function checks that the caller is a member of the target agency. The insert policy on `agency_talent_links` stays agency-member-only. Admin functions never write `agency_talent_links`. There is no talent insert policy.
- The agency's "invite talent" action gives a **neutral reply either way**: "If this person is on TalVault they'll receive a request; otherwise they'll receive an invitation." The server then picks the path. The response shape and timing are the same in both cases.
- If the email belongs to an agency member or an admin (not a talent), the agency still sees the same neutral reply. Nothing is created. A bell notification and an audit row go to platform admins.

## Build items

### 0. Prerequisites
- Turn off backend sign-ups and remove the sign-up mode from `/auth`.
- Remove the 2FA bypass. Timing is an open decision, options below.

**2FA bypass removal options (not chosen):**
- **(a) Remove now on all environments.** Nobody can sign in until emails send, because the sign-in code email cannot be delivered while `notify.talvault.com` is unverified. **Lockout risk: total** for testers and real users on preview and live.
- **(b) Remove once the domain is verified.** No lockout. Risk: until then the live site runs with password-only sign-in over real ID and financial records.
- **(c) Remove on live now, keep on preview only** (gated by the environment). Live users are locked out until the domain verifies. Preview keeps working for testing. Risk: preview and live share one database, so preview sign-ins still reach real data without 2FA.

### 1. Admin invites independent talent
- Draft → edit → upload the ID document and **one** proof-of-talent document → send gate. Same pattern as the agency compliance documents: inline helper text, a case-insensitive duplicate-filename check on both the page and the server, file-type checks that read the actual file contents, and a private storage bucket with admin-only rules.
- Date of birth is captured. Activation blocks anyone under 18.
- Invite email, acceptance, terms, emailed-code 2FA and activation reuse the existing talent flow.

### 2. Agency → new talent
Unchanged, apart from the neutral-reply email match (above) and the email copy alignment.

### 3. Agency link request to an existing talent
The talent accepts or declines in-app. Link status flow: `invited` → `active` on accept, or `revoked` on decline.
- **Default:** the talent must accept or decline before the link goes live.
- **If the product owner chooses "connect immediately" instead:**
  - `request_link` sets `active` and provisions the agency folders straight away.
  - The talent's email and bell change to "X is now connected to your TalVault", with an **"End connection"** action instead of Accept/Decline.
  - The Requests view becomes a "Connected agencies" list.
  - The decline path is removed. Ending reuses item 5.
  - Consent risk: the agency would see shared folders before the talent agrees. RLS stays the same, because it keys off `active`.

### 4. Originator: talent-controlled items
New column `talent_shared_documents.originator` (`agency` | `talent`).
- **Talent items:** no retention lock or folder rules. The talent can revoke at any time. The agency can only read.
- **Agency items:** existing rules apply.

### 5. Ending a relationship
- The existing "ended" rules already keep read access and block writes. Retention is stamped at upload.
- New: a talent read cut-off at `ended_at + retention_years_at_upload`. **The same cut-off applies to Quotes & Invoices** the agency shared with the talent. These stay visible, read-only, and are not hidden when the link ends.
- Q&I with no retention stamp use the agency's default retention period. If the agency has none, the platform default is used. That value goes into the memory file once chosen.
- Talent-originated items are never cut off.
- The agency can later send a new link request.

### 6. Private Vault {SHARE_TERM} for all talent
- Reuse `loved_one_shares`. Widen the relationship options and allow talent with no agency.
- **Close the gap:** stop emailing access codes. The regenerate action shows the new code to the talent only.

### 7. Rename "Loved One"
All user-facing copy reads from `src/lib/terms.ts`.

### 8. Quotes & Invoices visibility
- **Talent who never had an agency link:** no Q&I menu item, and the server returns a refusal.
- **Talent with active or ended links:** Q&I shows a list per agency, read-only for ended links until the cut-off.
- Fix the reader to match by `talent_link_id`, not by name.

### 9. Talent portal with zero agencies
- Agency-only panels are hidden.
- The Requests view and Private Vault are always available.
- `getTalentContext` returns `agencies: []` and `tier: "standard"` (a placeholder hook for future tiers, not built).

## End-to-end journeys

Notation: **Screen** · **Server function** · **Database change** · **Bell notification** · **Email**.

### J1. Admin invites independent talent
1. Admin clicks "Invite talent" on the dashboard. **Screen:** `/admin/invitations/new-talent` · `createTalentInvitationDraft` · `talent_invitations` row created with status `draft`, `agency_id` NULL, `invited_by_admin` true · Bell: none · Email: none. Admin dashboard: shows under "Draft talent invites".
2. Upload the ID document and proof of talent · `recordTalentInvitationDocument` (contents checked, duplicate name refused) · `talent_invitation_documents` row per slot · No bell or email.
3. Save and re-edit · `updateTalentInvitationDraft` · draft fields updated. The admin can reopen it from `/admin/invitations` (Type = Talent).
4. Send · `finalizeTalentInvitation`, which is refused until both slots are filled. Helper text: "Attach the ID document and proof of talent to send." · status becomes `pending`, `expires_at` = now + 14 days, `email_sent_at` set if delivered · Bell: none · **Email E1.** If sending fails, the copy-the-link modal appears.
5. Talent opens the link · `/invite/talent/$token` · `resolveTalentInvitationToken` · no change. Edge cases:
   - Expired → "This invitation has expired. Contact the TalVault team for a fresh one."
   - Already accepted → "Please sign in."
   - Revoked → revoked message.
   - Signed in as someone else → the existing stale-session clear signs them out first, then shows the wizard.
6. Account and password · `activateTalentInvitation` · `auth.users` row created, then `handle_new_user` → `accept_talent_invitation` independent branch: `talent_profiles` row (agency NULL) plus 19 private folders, no link, invitation status `accepted`. Edge case: the email already belongs to an agency member or admin → refused with "This email is already used for a different TalVault account. Ask the person who invited you to use another address." No account is created.
7. Terms · `legal_acceptances` row (version recorded). If that write fails, the account is rolled back.
8. Activation details: date of birth, phone, tax and so on · `talent_profiles` updated. **Under 18:** refused before the account is created, with "TalVault is for adults (18 and over) at this stage. Please contact the person who invited you." The invitation stays `pending`.
9. Emailed-code 2FA · the sign-in code flow · `mfa_settings` and `mfa_verified_sessions` rows · **Email E9.**
10. First landing on `/talent` · module tour starts (`tours/registry.ts`, independent variant with no agency steps) · Bell: welcome. Admin dashboard: the invite moves to `Accepted`, and "Talent onboarded · independent" goes up by 1.
- **Resend:** `resendInvitation` (talent kind, `pending` only) · `email_sent_at` refreshed · E1 sent again.
- **Revoke:** `revokeInvitation` · status `revoked` · **E3** (new).
- **Reminder:** 3 days before expiry, sent by the existing reminders cron · `talent_audit_log` `invite_reminder_sent` · **E2.**
- **Expiry:** the cron marks `expired` · **E3** expired variant · Bell to admins: "Talent invite expired".

### J2. Agency invites a brand-new talent (unchanged flow)
1. `/agency/talent/invite`, step 1 (details) · neutral email match.
2. Step 2 (shared folder) · `talent_invitations` row `pending` with `agency_id` set, plus a placeholder `agency_talent_links` row with status `invited` · **E4.** Agency bell: none. Admin dashboard: "Open invitations · talent" goes up by 1.
3. Steps 5 to 10 as J1. Acceptance turns the link `active` and provisions the agency folders. The agency gets a bell notification, "{name} accepted your invitation".
- Resend, revoke and expiry work as today. Reminder E2 uses the agency variant.

### J3. Agency requests to link an existing talent
1. The agency enters an email in the invite flow. The server finds an existing talent account · `inviteOrRequestTalentLink` · `agency_talent_links` row with status `invited`, `request_kind` `link_request`, `requested_at`, and `expires_at` = now + 14 days · the agency sees the neutral reply.
2. Talent: bell "{Agency} would like to connect with your TalVault" · **Email E5.**
3. Talent opens `/talent/requests`. **What the talent sees before accepting:**
   - Agency name, country, and the contact person's name.
   - The folders the agency would share (catalogue names).
   - What the agency will see: only the shared agency folders and documents placed in them.
   - What it won't see: the Private Vault, {SHARE_TERM}s, or other agencies.
4. Accept · `respondLinkRequest(accept)`, a SECURITY DEFINER function that checks `talent_user_id = auth.uid()` · status `active`, `responded_at`, agency folders provisioned · agency bell plus **E6 (accepted)**. Agency roster: card moves to Active. Talent portal: an agency panel appears.
5. Decline · status `revoked`, `declined_at` set · agency bell plus **E6 (declined)**. The agency can send a new request after 30 days (server check).
6. Agency cancels while pending · `cancelLinkRequest` · status `revoked`, `cancelled_at` set · talent bell cleared plus **E6 (cancelled)**, sent to the talent.
7. Expiry · the cron marks `expired` · bell to both sides · no email.
8. A second agency links the same talent · a separate link row. The two agencies cannot see each other (RLS is per agency).

### J4. Agency ends the relationship
1. The agency chooses "End relationship" from the roster menu · existing end function · status `ended`, `ended_at`, `ended_by` set.
2. Talent: bell plus **E7** · agency documents and Q&I become read-only.
3. Cut-off: after `ended_at + retention_years_at_upload` (per document, and per Q&I record), the talent can no longer read them. A nightly bell warns the talent 30 days before the cut-off.
4. Talent-originated documents stay visible and revocable, with no cut-off.
5. The agency can send a new J3 request later, which creates a new link row.

### J5. Talent creates a Private Vault {SHARE_TERM}
1. `/talent/sharing` → choose items · `createLovedOneShare` · `loved_one_shares` row (scope, permission, expiry, access code hash).
2. Recipient name, email and relationship · **Email E8** (link only). The talent sees the access code **once** on screen with "Send this separately", plus a copy button.
3. The recipient opens `/loved-one/$token` and enters the code · `unlockLovedOneShare` · `loved_one_share_access_events` row `open` · `view_count` goes up.
4. View and download events are logged as access events.
5. Five wrong codes lock the share (`locked_at`) · bell to the talent.
6. The talent revokes the share (`revoked_at`), the share expires (`expires_at`), or the talent regenerates the code (shown on screen only, never emailed).

### J6. Admin dashboard and reporting
Every KPI and table comes from a live query in `getDashboardMetrics` and `admin-reporting.functions.ts`, refreshed every 60 seconds and on demand:
- Talent onboarded, split: agency-linked (has an active link) and independent (no links).
- Open invitations, split: agency and talent.
- Pending link requests.
- Active {SHARE_TERM}s.
- Talent invitations overview table.

## Email copy (draft, for approval)
Every email uses the `brand-email.ts` header and footer. Footer for all: "TalVault · Secure vault for talent and their managers · This email was sent to {email} because of activity on your TalVault account. If this wasn't expected, you can ignore it." No ID details and no identifiers beyond the person's name.

**E1. Admin → independent talent invitation**
- **Subject:** You're invited to set up your TalVault
- **Preheader:** A private, invite-only vault for your important documents.
- **Heading:** Welcome to TalVault, {first_name}
- **Body:** TalVault is a secure, invite-only vault where talent keep contracts, ID, tax and career documents in one protected place. You've been invited by the TalVault team. Setting up takes about five minutes: choose a password, accept the terms, confirm your details and verify your sign-in with a code we email you. Your invitation expires on {expiry_date}.
- **Button:** Set up my TalVault

**E2. Invitation reminder**
- **Subject:** Your TalVault invitation expires on {expiry_date}
- **Preheader:** There's still time to set up your vault.
- **Heading:** Your invitation is waiting
- **Body:** You were invited to TalVault by {inviter} (TalVault team or {agency_name}). Your link stops working on {expiry_date}.
- **Button:** Finish setting up

**E3. Invitation expired / revoked**
- **Subject:** Your TalVault invitation is no longer active
- **Heading:** This invitation has closed
- **Body (expired):** Your invitation link expired on {date}. If you'd still like to join, ask {inviter} to send a new one.
- **Body (revoked):** {inviter} has withdrawn this invitation. No account was created and no details were kept.
- **Button:** none

**E4. Agency → new talent invitation (aligned)**
- **Subject:** {agency_name} has invited you to TalVault
- **Preheader:** Your private vault, shared safely with your manager.
- **Heading:** Your TalVault is ready to set up
- **Body:** {agency_name} uses TalVault to share documents with the talent they represent. You'll get your own Private Vault that only you can see, plus a shared folder with {agency_name}. Setting up takes about five minutes. Your invitation expires on {expiry_date}.
- **Button:** Set up my TalVault

**E5. Agency link request**
- **Subject:** {agency_name} would like to connect with your TalVault
- **Preheader:** Review the request in your vault.
- **Heading:** A connection request from {agency_name}
- **Body:** Connecting creates a shared folder between you and {agency_name}. They will see only what is placed in that shared folder. They will never see your Private Vault, your {SHARE_TERM}s or any other agency. You can accept or decline in TalVault. The request expires on {expiry_date}.
- **Button:** Review request (opens `/talent/requests` after sign-in and 2FA; there is no accept link in the email itself)

**E6. Link response notices**
- **Accepted (to agency):** Subject: "{talent_name} accepted your connection request" · Body: "Their shared folders are ready in your roster." · Button: Open roster
- **Declined (to agency):** Subject: "{talent_name} declined your connection request" · Body: "No access has been granted. You can send a new request after 30 days."
- **Cancelled (to talent):** Subject: "{agency_name} withdrew their connection request" · Body: "Nothing has changed in your vault."

**E7. Relationship ended (to talent)**
- **Subject:** Your connection with {agency_name} has ended
- **Heading:** What happens to your documents
- **Body:** {agency_name} has ended the connection. Documents and quotes/invoices they shared with you stay viewable, read-only, until each item's retention period ends (shown next to each item). Anything you added yourself stays yours, with no time limit, and you can remove it whenever you like. Your Private Vault is unaffected.
- **Button:** View shared items

**E8. {SHARE_TERM} email to recipient**
- **Subject:** {talent_name} has shared documents with you securely
- **Preheader:** No account needed. The password comes separately.
- **Heading:** You've received a {SHARE_TERM}
- **Body:** {talent_name} has shared {item_label} with you through TalVault. You don't need an account. You'll need a password, which {talent_name} will send you separately; TalVault never emails it. This link expires on {expiry_date}.
- **Button:** Open shared documents

**E9. Sign-in code (existing, reviewed)**
- **Subject:** {code} is your TalVault sign-in code
- **Body:** "Enter this code to finish signing in. It expires in 10 minutes. If you didn't try to sign in, change your password." The wording is neutral, so no change is needed for independent talent.

**Email delivery and fallback:** every email is blocked until `notify.talvault.com` is verified.
- **E1, E2, E4:** copy-the-link modal for the inviter.
- **E3, E6, E7:** bell notification only.
- **E5:** the bell plus the Requests view cover it fully.
- **E8:** the talent copies the link from the share screen.
- **E9:** no fallback. This is the reason for the 2FA bypass decision above.

## Admin dashboard wording (for approval)
- **Title and H1:** "Platform overview"
- **KPI cards:**
  - Total agencies
  - Open invitations: "{n} agency · {m} talent"
  - Talent onboarded: "{a} agency-linked · {i} independent"
  - Pending link requests
  - Documents uploaded
  - Active {SHARE_TERM}s
  - Suspended agencies
- **Tables:** "Agency onboarding overview" plus "Talent invitations overview"
- **Buttons:** "Invite an agency" · "Invite talent"
- **Empty state:** "No agencies or talent on the platform yet. Invite an agency or invite talent to get started."
- **`/admin/invitations`:** Type filter (All / Agency / Talent), with the shared row actions menu on every row.

## Technical details

**Migration A: independent invites**
- `talent_invitations`: `agency_id` DROP NOT NULL; add `invited_by_admin bool default false` and `date_of_birth date`.
- New table `talent_invitation_documents`, with unique indexes on (invitation_id, doc_slot) and (invitation_id, lower(file_name)). GRANTs, RLS on, admin-only policies.
- Private `talent-invite-docs` storage bucket with admin-only rules.
- New `accept_talent_invitation` with an independent branch.
- New trigger guard: an insert into `agency_talent_links` requires the caller to be a member of that agency (blocks admin attaches).
- **Rollback:** restore the old function, drop the guard, table and bucket, convert or delete null-agency rows, then set `agency_id` back to NOT NULL.

**Migration B: link requests**
- Add to `agency_talent_links`: `request_kind`, `requested_at`, `responded_at`, `declined_at`, `cancelled_at`, `request_expires_at`.
- New SECURITY DEFINER functions: `request_link`, `respond_link_request`, `cancel_link_request`.
- Unique partial index: one open `invited` link per (agency, talent).
- Extend the expiry cron to cover link requests.
- **Rollback:** drop the functions, index and columns.

**Migration C: originator and cut-off**
- `talent_shared_documents.originator`, backfilled from `uploaded_by`.
- Talent revoke policy covers talent-originated rows only.
- Agency update and delete policies are limited to agency-originated rows.
- The 3 retention triggers skip talent rows.
- SELECT policy cut-off for ended links.
- `agency_billing_docs`: add `talent_link_id`, backfilled where the name match is unambiguous, plus a cut-off on the talent read.
- **Rollback:** restore the previous policy and trigger definitions, drop the new columns.

**Server functions**
- `admin.functions.ts`: talent draft, update, document record/delete/list, finalise, paged list; extend metrics, resend, revoke and notifications.
- `talent-activation.functions.ts`: date of birth and under-18 block; independent branch.
- `agency.functions.ts`: `inviteOrRequestTalentLink` (neutral reply), `cancelLinkRequest`.
- `talent.functions.ts`: `listLinkRequests`, `respondLinkRequest`, a zero-agency `getTalentContext`, billing per link with cut-off, `revokeTalentOriginatedDocument`.
- `loved-one.functions.ts`: widen relationship options; regenerate shows the code on screen and sends no email.
- `admin-reporting.functions.ts`: independent vs agency-linked split.
- `talent-reminders.server.ts`: invitation reminder, expiry, link-request expiry, cut-off warning.
- `mfa.functions.ts`: bypass removal (per the decision).

**Email builders:** `invitation-email.ts` (E1 to E4 variants), new `link-request-email.server.ts` (E5, E6), new `relationship-email.server.ts` (E7), `loved-one-email.server.ts` (E8 copy; the regenerated-code email is retired), `mfa.server.ts` (E9 unchanged). All are sent through `invitation-email.server.ts` with new labels.

**Routes:**
- New: `admin.invitations.new-talent.tsx`, `talent.requests.tsx`.
- Edited: `admin.index.tsx`, `admin.invitations.index.tsx`, `admin.reporting.tsx`, `admin-shell.tsx`, `auth.tsx`, `invite.talent.$token.tsx`, `talent-shell.tsx`, `talent.index.tsx`, `talent.budget.tsx`, `talent.sharing.tsx`, `talent.vault.tsx`, `talent.notifications.tsx`, `agency.talent.invite.tsx`, `agency.talent.index.tsx`, `tours/registry.ts`.
- New file `src/lib/terms.ts`, plus every file with "Loved One" copy.

## Test checklist (each in a rolled-back transaction with a database check)
1. **Sign-up off:** a direct sign-up attempt fails; `auth.users` count is unchanged. `/auth` has no sign-up mode.
2. **2FA:** after removal, no `MFA_TEST_BYPASS` in `src/`; a new device gets `gate = "challenge"`.
3. **J1 draft:** status `draft`, `agency_id` NULL.
4. **J1 gate:** finalising with 0 or 1 documents is refused; a duplicate name is refused by the unique index; a fake PDF is refused.
5. **J1 send:** status `pending`, `expires_at` set.
6. **J1 acceptance:** profile has `agency_id` NULL, 0 links, 19 private folders, invitation `accepted`, a `legal_acceptances` row.
7. **J1 under-18:** refused; no `auth.users` row; invitation still `pending`.
8. **J1 email conflict:** an email belonging to an agency member or admin is refused; no user is created.
9. **J1 resend / revoke / expiry / reminder:** resend only works on `pending`; revoke gives `revoked`; the cron gives `expired`; reminder audit row present.
10. **Admin cannot attach:** an admin insert into `agency_talent_links` for any agency affects 0 rows or raises an error.
11. **Talent cannot request:** a talent insert into `agency_talent_links` is refused.
12. **J2 regression:** placeholder link `invited` becomes `active`; agency folders provisioned.
13. **J3 neutral reply:** existing and new emails return an identical response payload.
14. **J3 request:** link `invited` with `request_kind = 'link_request'`; a duplicate open request is blocked by the index.
15. **J3 accept:** `active`, `responded_at` set, folders provisioned. Another talent calling respond gets an error.
16. **J3 decline / cancel / expiry:** `revoked` with `declined_at`; `revoked` with `cancelled_at`; `expired`. A re-request within 30 days is refused.
17. **J3 second agency:** two active links; agency A cannot read agency B's link (0 rows).
18. **J4 end:** `ended`; talent can read agency documents and Q&I within retention; 0 rows after the cut-off; agency writes 0 rows.
19. **Originator:** the talent can delete a talent-originated document even with `locked_until` in the future; agency delete of it affects 0 rows; agency documents keep their lock.
20. **J5 share:** row created with code hash; unlock writes an access event; 5 failures set `locked_at`; revoke sets `revoked_at`; regenerate sends no email (no row in the email log).
21. **Q&I:** a talent who never had a link is refused; ended-link Q&I visible within retention; matching uses `talent_link_id`.
22. **Zero-agency portal:** dashboard, vault, notifications and requests load with no runtime errors.
23. **J6:** each KPI equals a direct `count(*)`; the `/admin/invitations` Type filter returns both kinds.
24. **RLS:** an agency member cannot read `talent_invitation_documents` or the bucket objects.

## Open decisions
1. Replacement term for {SHARE_TERM} and {SHARE_RECIPIENT_TERM}.
2. Link requests: talent accepts first (default) or the agency's request connects immediately.
3. 2FA bypass removal: option (a), (b) or (c).
4. Platform default retention period for Q&I with no retention stamp.
5. Approval of the admin dashboard wording and the email copy E1 to E9.
