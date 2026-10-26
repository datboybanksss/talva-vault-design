<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Product decisions
- Theme: all colours/surfaces/shadows are semantic tokens in `:root` / `.dark` in `src/styles.css`. Why: theming without component rework.

## Technical decisions
- All displayed sharing terminology imports the constants in src/lib/terms.ts; legacy identifiers and URLs remain unchanged. Why: consistent sentence case without breaking existing shares.
- Database change history lives only in `supabase/migrations`; a change applied through another tool is copied there as a guarded, no-op-if-present file with rollback SQL in a comment. Why: one history, never re-applied on the live database.
- Every agency talent invitation creates the same agency-visible rows; whether it is really a connection request to an existing account or an inert (never-acceptable) invitation is stored only in `talent_invite_private`, written by service-role functions and unreadable by agency members, and copied onto `agency_talent_links` only when the talent accepts. Why: Agency T&C §6.3 — no account-existence leaks.
- Post-end/suspension access is decided only in the database: talent reads by talent_link_read_until(), agency writes by agency_is_writable(), staff reads by agency_read_only_until(); one window length (post_end_read_only_years() = talent_post_end_access_years()), used by server code and RLS. Why: one rule, one number.
- Terms acceptances are append-only and stamped by the database trigger legal_acceptances_stamp (hash, time, identity, role, agency, proof reference); server code only passes document, method, IP and user agent, and accepted legal_documents versions are locked by legal_documents_guard. Why: acceptances must prove exactly which text was accepted and can never be altered.
- The Terms gate renders the unmodified stored body with safe Markdown, keys agreement state by document ID/hash, and submits the displayed hash with the UUID. Why: agreement must reset for new text and cannot silently accept a different body.
- Terms acceptance is decided only by public.has_accepted_current_terms() (admins always pass); talent server functions use the requireTalentTermsAccepted middleware, agency ones get the check inside getCallerAgency/callerAgencyId, and RLS adds restrictive "Terms not accepted" write policies via terms_write_allowed(). Why: one rule, enforced on the server and in the database, not only in the portal screen.
- Lifecycle status labels and pill colours come only from statusLabel/statusPillClass in src/lib/status-labels.ts (colours = --st-* tokens), and Admin/Agency row actions only from src/lib/status-actions.ts, which the matching server functions also check. Why: one list logic in every portal, enforced on the server too.
- Filing review provenance: every filed document stores folder_source/expiry_source ('ai' | 'filename' | 'user'); the filename heuristic is never labelled or recorded as AI, and the server accepts 'ai' only for a completed document_ai_analyses row whose values match (checkAiSources in src/lib/document-ai-core.ts). Why: nothing may claim to be AI that isn't.
- Document AI: Parserly is reached only through src/lib/parserly.server.ts (analyseDocument/pollAnalysis); document_ai_analyses is written only by src/lib/document-ai.server.ts with the service role, which checks the requester's own profiles.ai_filing_enabled on the server before any file is sent. Why: one integration point, and a switched-off user's files can never leave TalVault.

- Document preview/filing use DocumentModal (Radix focus, portal-safe tvp tokens); AI preference changes go through syncAiFilingPreference; reminder rules live in document-reminder-core. Why: accessible modals, consistent caches, testable shared rules.

- CI lint is blocking and excludes only managed/generated integration output; unresolved authored-code findings stay enabled. Why: do not hide lint debt or rewrite regenerated files.
- Invitation duplicate-email rules live only in src/lib/invite-email-check.ts (messages, matching) and are enforced by assertInviteEmailFree before every invitation insert/send; agency checks never look outside the caller's agency and agency talent invites never reveal accounts. Why: one message set, no cross-agency leaks.
- Admin invitations render only through CombinedInvitationsList (listCombinedInvitations; type/status options only from src/lib/invitation-filters.ts; agency row actions only from useAgencyInvitationActions), and Admin accounts only through listAccounts with filters in src/lib/account-filters.ts. Why: one list, filtered and paged on the server.
- Admin launch reports compute every figure through src/lib/launch-reporting-core.ts (SAST day boundaries), loaded by launch-reporting.functions.ts; launch targets/offer live only in platform_settings key "launch". Why: tested figures, editable targets.
- Admin agency/independent-talent invitation emails render only through renderAdminInvite (src/lib/invitation-email.ts) for the Review email preview, send and resend; approved wording and an exact copy of the sent email are stored on the invitation row by deliverAdminInvite. Why: the preview, the sent email and the record can never differ.
- Real vs test accounts: agencies.is_test / talent_profiles.is_test, changed only by setAccountTest (audited); the real/test/all scope rule lives in src/lib/account-filters.ts (reports default to real) and launchOffer never allocates places to test accounts. Why: test data must never inflate launch figures or use offer places.
- Account Pause/Suspend: transitions, reasons and wording only in src/lib/account-state.ts, applied by changeAccountState; pause (paused_at overlay) is enforced by account_paused() restrictive policies, blockPausedAccounts middleware and an auth ban; suspended talent are read-only via talent_account_writable() plus requireTalentWritable/assertTalentWritable. Why: enforced in database and server; unpausing restores the prior state.
- Quote/invoice client details are synced by the database trigger billing_doc_client_sync: drafts always mirror the linked agency_clients row, leaving draft requires a client, and issued documents keep a frozen client_snapshot. Why: issued documents are a legal record and the rule must hold for every write path.
- Reasons a document action is refused (read-only, ended relationship, talent-owned, retention) come only from src/lib/document-blocks.ts; menus show them via RowAction.disabledReason and the server throws the same text. Confirmations use useConfirm, never window.confirm. Why: one wording, never a silent no-op.
- Document retention is stamped once per document and per version at upload (current_retention_rule) and never recalculated; rule changes, overrides and edits to earlier versions are refused in the database. Why: rules are not retroactive and cannot be overridden.
- Talent-portal agency visibility (active / previously shared / hidden) is decided only by classifyTalentLink in src/lib/talent-links-core.ts via loadTalentLinks; every agency-only talent endpoint and screen uses that list. Why: independent talent must never see agency items, on screen or from the server.
- Terms acceptance reports (Admin acceptances and not-accepted lists) leave out Test accounts via testUserIds in src/lib/terms-gate-core.ts; the acceptances are still stored with the normal proof. Why: test data must never inflate Terms or launch figures.
- Shared brand visuals use src/components/shared/brand.tsx and styles.css tokens; tones: Talent/contact warm, Agency business, Admin calm. Why: one themed look.
- Read src/lib/AGENTS.md before changing auth; TVA-SEC-101 deferred — 2FA owned by the live app.
- File access requires server validation; file-security owns MIME/headers and cleanup atomically queues abandoned reservations. Why: client claims and races cannot expose or destroy files.
- Shares insert token/hash together, billing uses owned link IDs, and public limits fail closed. Why: server-enforced access.
- Database failures use security-errors/invite-claim-error. Why: safe messages.
- Billing confirmation bundles theme tokens under strict CSP. Why: no external assets.
- Only cron sweeps overdue invoices. Why: no global writes by readers.

- Onboarding duplicate names and blocked-row display use onboarding-documents; service-only insert triggers replace blocked rows atomically and queue old objects, and draft screens retain their staging session. Why: corrected files never erase valid files or hide missing slots.
