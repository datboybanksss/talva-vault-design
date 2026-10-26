# Roadmap
- [x] TVA-SEC-112: all invitation wizards use server admin creation; hosted signup already disabled; enabled Google while preserving disable_signup; public signup refusal tested; two unlinked non-test addresses reported.
- [x] TVA-SEC-113: four invitation claim failure branches sanitised with server logs; focused tests pass.
- [x] TVA-SEC-114/115: revoked anonymous/PUBLIC execution on 14 functions; sweep service-only; hourly job active with successful runs; invoker view and admin SELECT policy tested as admin/non-admin in read-only database assertions.
- [x] TVA-SEC-116: confirmation uses actual bundled tokens; desktop/mobile light/dark checked; escaping, POST-only and strict CSP tests pass.
- [ ] TVA-SEC-112/115: real Google existing/new-account OAuth and authenticated admin screen checks require suitable Test Google account / approved Test session; session mint unavailable, no real account substituted.
- [x] TVA-SEC-102/111: derived file types, five-table validation receipts, safe streamed responses, legacy SVG download-only, atomic private-reservation cleanup, folder ownership.
- [x] TVA-SEC-103/104/110: atomic coded shares, fail-closed access, link-ID billing scope, configured email URLs.
- [x] TVA-SEC-105/106/109: escaped POST-only sender verification, exact invite email match, fail-closed public token limits.
- [x] TVA-SEC-107/108: filled seven paused-account policy gaps; raw error throws replaced with logged friendly failures, MFA excluded.
- [x] TVA-SEC-102–111: 62 focused/regression tests pass; zero pause-policy gaps and uncoded active shares; 70 legacy receipts plus two download-only SVGs; public rejection screens checked; preview build OK.
- [x] TVA-SEC-102: daily cleanup queues new unregistered objects in all four upload buckets after 24 hours; preserves pre-rollout files and refuses removal when a document reference exists.
- [ ] TVA-SEC-102: seven legacy rows remain quarantined (three shared, one version, three compliance); unsupported or missing bytes need replacement from their owners, never delete them.
- [ ] TVA-SEC-102–111 deployment and authenticated end-to-end verification — restored frontend/security batch not published; requires user publishing request and a dedicated Test session. Two-factor remains untouched.
- [ ] TVA-SEC-101 deferred — 2FA owned by the live app; requires a new product owner decision before build-level enforcement.
- [x] Revert TVA-SEC-101: restored exact pre-change password-only code/routing; removed public/storage MFA policies and REST guard; retained safe MFA write revokes; 10 regressions pass; preview sign-in renders without errors.
- [ ] Verify dedicated Test talent password sign-in to /talent and direct session table reads — blocked: no Test password available and Test-session mint approval unavailable in this context; never substitute a real account.
- [x] Pause/Suspend for agencies and talent
- [x] Row actions menu on every Accounts row
- [x] Report why invited agencies appear in Accounts (awaiting Lara decision)
- [x] Fix agency.document-vault.tsx syntax errors (build broken)
- [x] Standing rule: boundary audit — clean (owner-only RLS on private tables + bucket; agency code never reads private tables)
- [x] Feature: talent "Copy to agency shared folder" (server fn, dialog, bell entry, duplicate check, tests)
- [x] Removed talent dashboard expiring list (Agency/Admin had none); KPI counts kept
- [x] Bell coverage verified: same thresholds, talent + agency covered
- [x] Bell deep links + mark-as-read + friendly fallback (talent vault, agency vault, admin)
- [x] Agency talent details page: clickable roster cards + stat links; detail page (breadcrumb, header/actions, contact details, shared folder docs with filters/upload/versions, Q&I in ZAR, activity, tabs); status-aware, server-enforced; reuse Document Vault "folders" view (keep its route); roster subtitle "See your talent, their documents and invitations."
- [x] Talent Vault: shared folder shown nested by category (report + merge proposal awaiting Lara's approval)
- [x] Talent with several agencies: one shared section per agency
- [x] Talent dashboard redesign (To do, Vault summary, Sharing; Budget left out — coming soon)
- [x] Talent portal: agency items only when linked; 'Previously shared with'; one section per agency
- [x] Platform look: shared brand pieces (PageBand, IconTile, EmptyState, tints, FileTypeIcon) + Talent portal applied
- [ ] Platform look: Agency portal (business tone) — next, after Talent report
- [ ] Platform look: Trusted contact portal (warm)
- [ ] Platform look: Admin portal (calm tone)
- [ ] Platform look: shared screens (sign-in, 2FA, activation wizards, Terms gate, error pages, emails)

- [x] Delete two unmatched accounts; quarantine reasons + "Blocked for security" status; Google sign-in off

## Batch: hardening, faster sign-in, onboarding uploads
- [x] A Sign-in speed: one access RPC, 60s cache, background code request
- [ ] A timing per role — blocked: no Test account passwords to time a real sign-in
- [x] B Staged onboarding uploads (talent + agency)
- [x] C1–C4, C6–C9
- [ ] C5 CSP nonces — left unchanged: needs per-request nonce plumbing into the router and hosting-injected scripts would break

## Follow-up fixes
- [x] Corrected onboarding files may replace blocked files with the same name, including post-draft uploads; agency staging flow checked on screen.
- [x] Blocked staged files remain visible and removable after saving a draft; shared state tests pass. Saved-draft/talent and mobile/dark walkthroughs not completed.
- [x] All scheduled app URLs use production; reminder target updated to configured primary host, hook available, secret timestamp unchanged.
- [x] Failed sign-in access lookup discards local session; two tests pass.
- [x] Safe automatic style fixes; 266 tests pass, five environment-dependent checks skipped; automatic type/build checks pass.
- [ ] Remaining lint: 1,031 errors and 43 warnings — 1,028 explicit-any, three protected MFA formatting, 39 refresh and four dependency warnings. Unsafe type/logic refactors and forbidden MFA edits left unchanged.

## Type-safety clean-up (1,028 no-explicit-any) — batch plan
- [x] Batch 1 — Shared components, shells, small utilities, shared/auth/invite/api routes (~115): components/shared/ai-filing-review-modal.tsx (4), onboarding-tour.tsx (8), row-actions-menu.tsx (3), preview-dialog.tsx (1), use-analyse-with-ai.ts (1); components/talent/talent-shell.tsx (8), security-log-panel.tsx (3), agency-relationships-panel.tsx (1), vault-folders-panel.tsx (2); components/admin/admin-shell.tsx (3), account-state-details.tsx (1); lib/account-guard.ts (3), terms-guard.ts (6), admin-print.ts (3), invitation-status.ts (2), onboarded-talent.ts (8), link-notify.server.ts (5), document-ai.server.ts (3), invite-email-check.server.ts (3), admin-invite-email.server.ts (3), invitation-email.server.ts (4), legal-acceptance.server.ts (1), billing-email.server.ts (1), talent-activity.server.ts (1), invite-email-check.functions.ts (1); routes/auth.tsx (3), invite.$token.tsx (2), invite.admin.$token.tsx (2), invite.talent.$token.tsx (3), loved-one.$token.tsx (10), api/public/loved-one-file.ts (2), api/public/hooks/talent-reminders.ts (1), lovable/email/queue/process.ts (5)
- [ ] Batch 2 — Talent portal (~148): lib/talent.functions.ts (33), talent-vault.functions.ts (8), talent-audit.functions.ts (7), talent-activation.functions.ts (4), link-requests.functions.ts (3), loved-one.functions.ts (19), independent-talent.functions.ts (19); routes/talent.vault.tsx (23), talent.sharing.tsx (20), talent.notifications.tsx (5), talent.index.tsx (3), talent.settings.tsx (3), talent.requests.tsx (1)
  - Partial Batch 2: zero explicit-any in link-requests.functions.ts, talent-audit.functions.ts, talent-vault.functions.ts, talent.requests.tsx, talent.notifications.tsx and talent.settings.tsx; inferred notification rows in talent.functions.ts. Remaining Batch 2 findings: 120 (from 148); project: 891 (from 919), 43 warnings. No queries restructured or behaviour changed. Remaining files require a follow-up, including the coupled loved-one return/ShareState and JSON scope/preferences contracts. Automatic validation recovered after a delay; latest preview build OK.
- [ ] Batch 3 — lib/agency.functions.ts (203) on its own
- [ ] Batch 4 — Agency UI (~170): routes/agency.invitations.tsx (28), agency.quotes-invoices.tsx (24), agency.document-vault.tsx (11), agency.talent.$linkId.tsx (9), agency.contracts.$id.tsx (6), agency.talent.index.tsx (6), agency.invitations.$id.email-preview.tsx (3), agency.my-account.tsx (3), agency.index.tsx (2), agency.talent.invite.tsx (2), agency.document-requests.tsx (1); components/agency/* (72)
- [ ] Batch 5 — lib/admin.functions.ts (110) on its own
- [ ] Batch 6 — Admin server + reporting (~135): lib/admin-reporting.functions.ts (41), launch-reporting.functions.ts (32), terms-acceptance.functions.ts (30), ai-filing.functions.ts (13), document-settings.functions.ts (11), invitation-email.functions.ts (6), admin-invite-email.functions.ts (5)
- [ ] Batch 7 — Admin UI (~140): routes/admin.administrators.tsx (23), admin.accounts.tsx (17), admin.invitations.new.tsx (12), admin.agencies.$id.tsx (8), admin.audit.tsx (5), admin.quotes-invoices.tsx (5), admin.administrators.$id.email-preview.tsx (4), admin.reporting.tsx (4), admin.index.tsx (3), admin.my-account.tsx (3), admin.talent.$id.tsx (2); components/admin/* (54)
- [ ] Batch 8 — Tests and mocks (22): components/shared/ai-filing-review-modal.test.tsx (19), lib/document-quarantine.test.ts (2), lib/account-guard.test.ts (1)
