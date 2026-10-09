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
