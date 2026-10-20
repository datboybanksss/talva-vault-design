# Roadmap

## Trusted contact rename
- [x] Rename visible terminology centrally without changing internal names or stored/legal text.
- [x] Audit legal and stored occurrences; verify remaining source hits and automatic validation.

- [x] Give invoice emails the same full inline document content as quotations.
- [x] Require a verified sender and preserve invoice status on failed or partial delivery.
- [x] Add a separate manual Mark as sent action that mints a final invoice number.
- [x] Verify Preview actions, page loading and type safety.
- [x] Make Talent activation step 4 (two-step sign-in) mandatory, no skip.
- [x] Show a Coming soon state on the Talent Budget & Income page.
- [x] Agency client management for quotes & invoices.
- [ ] Warm up the Talent Vault folder grid, tabs and filter row visually.

- [x] Fix spacing/layout of Agency Quotes & Invoices settings cards (UI only)

## Independent talent (invite-only) — PAUSED by product owner, awaiting decisions
- [ ] Close self-sign-up (backend setting + remove sign-up mode on /auth)
- [ ] Migration: independent invites, link requests, originator, cut-off, billing link
- [ ] Admin: invite independent talent (draft, 2 docs, gate, send)
- [ ] Activation: date of birth + under-18 block; independent branch
- [ ] Agency: neutral invite-or-request; cancel request; link-response bell
- [ ] Talent: Requests view (accept/decline); zero-agency portal; Q&I per link
- [ ] Talent-originated revoke; sharing gap (no emailed codes); {SHARE_TERM} constant
- [ ] Admin dashboard wording/splits; invitations Type filter; reporting split
- [ ] Emails E1–E8 builders
- [ ] Tours for new screens
- [ ] Blocked on decisions: link-request mode, 2FA bypass removal timing, Q&I default retention

## Independent talent QA fixes (Oct 2026)
- [x] Invitations page Invite Talent uses neutral server reply
- [x] Link requests look like invitations (typed name, token, revoke/resend, status sync, /talent/requests)
- [x] Migration history moved to supabase/migrations; drizzle removed
- [x] Purge independent invite documents on revoke/expiry
- [x] Clear locks on talent-originated items
- [x] Function exposure hardened
- [x] Q&I talent link on save, fallback reader, Link to talent action
- [x] Framework versions pinned to >=14 days old; root error typed

## 10-year post-end access (Oct 2026)
- [x] DB cut-off = 10 years from relationship end or agency suspension; talent-added items unlimited
- [x] Q&I reader, request uploads, copy (E7, bell, 30-day warning, vault, tour)
- [x] Agency staff read-only for 10 years after suspension; no access after; reinstating restores writes

## Status & row-action consistency (Oct 2026)
- [x] Confirm live vault picker amber/raw cause; check Gift link row
- [x] Shared status labels/--st-* colours in all three portals
- [x] Shared allowed-actions (Admin/Agency) + server checks + tests
- [ ] Admin agency detail: row action menus on its two invitation tables (awaiting go-ahead)
- [x] "Pause relationship" → "End relationship"; Reactivate direct (owner, writable); Draft neutral

## Filing when AI is skipped/fails/off (Oct 2026)
- [x] Per-user AI switch (profiles.ai_filing_enabled, default on) in Talent and Agency settings
- [x] Modal modes ai/filename/manual/failed; filename guess labelled "Suggested · Based on the file name", never AI
- [x] Per-field sources stored; server refuses 'ai'; agency filing saves reminder_at; talent filing audited
- [x] View document on every Private Vault row; Pending review pill on talent's shared list
- [x] Reminders read shared reminder_at; tests + type-check green

## Approved audit fixes — 20 October 2026
- [x] Hide suspended-agency vault write actions.
- [x] Correct reminder eligibility, due dates and dedupe.
- [x] Fix deepest filename matching, bounded polling and preference synchronisation.
- [x] Audit every membership and verify analysis read permissions.
- [x] Bring filing, preview, pending pills and AI switch onto shared tokens/controls.
- [x] Run tests and verify light/dark layouts; report remaining click-through checks.

## Separate lint clean-up — 20 October 2026
- [x] Apply formatting-only pass without touching managed integration files.
- [x] Triage remaining rules and fix behaviour-preserving cases.
- [x] Make CI lint failures blocking.
- [x] Run tests and inspect automatic validation; report approval-required lint debt.
- [ ] Resolve remaining lint debt — awaiting approval for type refactors, draft hydration effects and mixed-export refactors; see LINT-TRIAGE.md.
