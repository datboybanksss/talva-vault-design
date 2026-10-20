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

### Dark mode — deferred (decided)
Dark mode is **intentionally out of scope** for TalVault at this stage. It is a
known future item, not an unresolved question: do not add a theme toggle or
`.dark` overrides without an explicit decision to reverse this.

The design system is already structured to support it without a rework — all
colours/surfaces/shadows live as semantic tokens in `:root` in `src/styles.css`
and the `dark` variant is registered. Adding it later = one `.dark { ... }` token
block plus a toggle. See the note at the top of `src/styles.css`.

## Technical decisions
- All displayed sharing terminology imports the constants in src/lib/terms.ts; legacy identifiers and URLs remain unchanged. Why: consistent sentence case without breaking existing shares.
- Database change history lives only in `supabase/migrations`; a change applied through another tool is copied there as a guarded, no-op-if-present file with rollback SQL in a comment. Why: one history, never re-applied on the live database.
- Every agency talent invitation creates the same agency-visible rows; whether it is really a connection request to an existing account or an inert (never-acceptable) invitation is stored only in `talent_invite_private`, written by service-role functions and unreadable by agency members, and copied onto `agency_talent_links` only when the talent accepts. Why: Agency T&C §6.3 — agencies must not be able to tell whether an account exists.
- Talent post-end read access is decided only by public.talent_link_read_until() (window length in talent_post_end_access_years()); server code and RLS both call it. Why: one rule, one number.
- Agency write access is decided only by public.agency_is_writable() (suspended = read-only); staff reads end at agency_read_only_until(), whose length is post_end_read_only_years() — the same single number talent_post_end_access_years() returns. Server write paths use getWritableCallerAgency/agency_is_writable and RLS uses restrictive "Suspended agency read-only" policies. Why: one rule, enforced in the database as well as the server.
- Terms acceptances are append-only and stamped by the database trigger legal_acceptances_stamp (hash, time, identity, role, agency, proof reference); server code only passes document, method, IP and user agent, and accepted legal_documents versions are locked by legal_documents_guard. Why: acceptances must prove exactly which text was accepted and can never be altered.
- Terms acceptance is decided only by public.has_accepted_current_terms() (admins always pass); talent server functions use the requireTalentTermsAccepted middleware, agency ones get the check inside getCallerAgency/callerAgencyId, and RLS adds restrictive "Terms not accepted" write policies via terms_write_allowed(). Why: one rule, enforced on the server and in the database, not only in the portal screen.
- Lifecycle status labels and pill colours come only from statusLabel/statusPillClass in src/lib/status-labels.ts (colours = --st-* tokens), and Admin/Agency row actions only from src/lib/status-actions.ts, which the matching server functions also check. Why: one list logic in every portal, enforced on the server too.
- Filing review provenance: every filed document stores folder_source/expiry_source ('ai' | 'filename' | 'user'); the filename heuristic is never labelled or recorded as AI, and the server accepts 'ai' only for a completed document_ai_analyses row whose values match (checkAiSources in src/lib/document-ai-core.ts). Why: nothing may claim to be AI that isn't.
- Document AI: Parserly is reached only through src/lib/parserly.server.ts (analyseDocument/pollAnalysis); document_ai_analyses is written only by src/lib/document-ai.server.ts with the service role, which checks the requester's own profiles.ai_filing_enabled on the server before any file is sent. Why: one integration point, and a switched-off user's files can never leave TalVault.

- Document preview and filing use DocumentModal with Radix focus containment and portal-independent tvp tokens. Why: modal accessibility and light/dark styles must survive portalling outside the shell.
- Every AI preference surface uses syncAiFilingPreference for cache transitions. Why: the popup, Settings and pending-row actions must agree and discard old suggestions.
- Reminder date eligibility and wording use document-reminder-core. Why: explicit reminders, expiry windows and ended-link exclusions need testable shared rules.
