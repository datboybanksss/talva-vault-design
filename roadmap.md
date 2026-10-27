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
- [x] Batch 2 — Talent portal: all 13 files at 0 explicit-any (148 → 0); project 891 → 771; automatic validation: 0 TypeScript errors, build OK; 266 tests pass.
  - Fixed in approved bug-fix run: managerName now uses the actual profile name fields.
- [x] Batch 3 — lib/agency.functions.ts (203 → 0); approved bug fixes resolved the final three typing blockers.
  - Continued run: 136 → 3 explicit-any; project 704 → 571; lint 580 errors / 43 warnings; 266 tests passed / 5 skipped. All remaining sections reviewed; three retained blockers listed below. Batch remains unticked because the approved protected RPC cast alone prevents 0.
  - Queries/filters unchanged. Vault filter-builder generic derives the two existing select types without executing additional queries; one `as Q` preserves the same result projection. Invitation email-preview queryFn made async solely to infer Promise of the talent/staff union after both return types became real; selected function, input and result unchanged.
  - Partial validated run: 203 → 136 explicit-any; project 771 → 704; lint 713 errors / 43 warnings; 266 tests passed / 5 skipped. Typed agency access helpers, notifications, metrics, roster, invitation/staff reads and writes, billing-link resolver, folder/count reads; remaining document operations, billing, settings and audit typing deferred. Batch remains unticked.
  - Automatic validation after the final functional edit: `=== build 2026-10-27T13:17:23Z === build OK`; no TypeScript errors in that entry. No queries restructured and no runtime changes intended.

### Found during type clean-up
- Batch 4 — Invitation `last_sent_at` is nullable, but the existing date formatter converts null to the Unix epoch rather than showing an unsent state. Left unchanged; the nullable input assertion deliberately preserves that behaviour.
- Batch 4 — `listAgencyInvitationsMine` emits `stored_status` at runtime but its declared `InviteRow` omits it. UI uses a narrow optional-field intersection without altering the server/query; contract correction deferred.
- Batch 4 — AgencyReminder declares key/snapshot independently optional, while the shell exposes dismissal on key alone. Existing computed reminder producers provide both; retained a narrow dismissal assertion rather than adding a new guard or changing dismissal behaviour.
- Fixed — Dashboard manager and document-version uploader names select display_name, first_name, last_name, email; shared profileName helper replaces unknown workarounds. Live version/profile joins confirm names exist; authenticated history UI still requires a dedicated Test session.
- Fixed — Declined responses included; live SQL confirmed new declines exist only in talent_invite_private, so reminders merge agency-scoped completed declines without altering roster state or leaking pending matches. Accepted wording, keys and dismissal behaviour preserved.
- Fixed — attach_talent_invite_private already accepts null; added DEFAULT NULL, regenerated optional argument type, omitted absent email to preserve SQL NULL; removed RPC cast.
- Fixed — Null billing accent resets to the existing TalVault teal preset; shared constant, reset control, typed middleware/update.
- Fixed — UI offers declined/partial; enum extended, both validators aligned, payload uses TablesInsert. Payment recompute and overdue sweep include partial; reports use remaining receipts balance; shared status labels cover billing/PDF views.
- Regression results: 273 passed, 5 environment-dependent skips; agency explicit-any 3 → 0; project 571 → 566; lint 569 errors / 43 warnings (remaining pre-existing findings).
- [ ] Approved bug fixes: authenticated save/reset/version-history/response UI checks — blocked: dedicated QA Test session mint requires unavailable approval. Real requesting-user session not used; no Terms accepted.

## Remaining type-safety batches
- [x] Batch 4 — Agency UI: measured 159 → 0 explicit-any; project 566 → 407. Eleven listed routes plus every components/agency file checked. Final automatic validation: `=== build 2026-10-27T14:02:13Z === build OK` (no TypeScript errors in that entry). Full suite: 273 passed, 5 skipped, 0 failed. Final lint: 410 errors / 43 warnings, all existing outside-batch errors; no batch lint errors.
  - Routes: agency.invitations.tsx, agency.quotes-invoices.tsx, agency.document-vault.tsx, agency.talent.$linkId.tsx, agency.contracts.$id.tsx, agency.talent.index.tsx, agency.invitations.$id.email-preview.tsx, agency.my-account.tsx, agency.index.tsx, agency.talent.invite.tsx, agency.document-requests.tsx.
  - Components checked: agency-profile-panel, agency-read-only, agency-shell, billing-document, billing-period-selector, billing-preview-dialog, billing-reports-panel, billing-sender-card, billing-summary-cards, billing-trend-chart, client-detail-panel, client-picker, clients-panel, document-rules-panel, folder-templates-panel, invoice-payments-dialog, manage-folders-panel, quotes-invoices-settings-panel, recently-deleted-dialog, talent-link-actions, vault-requests-panel (all .tsx).
  - No queries, filters, permissions, validation, messages or UI text changed; no test sessions minted; two-factor and eslint configuration untouched. Settings save now receives the already-populated form as a mutation argument; success retains null if no form exists (that state is unreachable through the existing save UI). Invoice total reads the same document through q.data inside the existing populated branch. Invitation preview narrows talent/staff fields and optional failure detail; absence remains undefined as before.
  - Assertions retained: existing concrete query/row contracts, known selector keys/literal choices, callback-selected invitation payloads, nullable filtered date, optional stored_status runtime contract, and key/snapshot dismissal contract above. No new as any, as unknown as X, as never or eslint-disable. Existing three as never in agency.tsx are outside the eleven listed screen routes and remain untouched.
  - JSON: no changed JSON-column access needed a new parser; settings state uses named BillingSettingsForm, invitations use named payloads, identity/staff/client/document/activity/payment results use server return types or inference. Existing billing Row projection and concrete query assertions remain unchanged rather than restructuring reads.
- [ ] Batch 5 — lib/admin.functions.ts (110) on its own
- [ ] Batch 6 — Admin server + reporting (~135): lib/admin-reporting.functions.ts (41), launch-reporting.functions.ts (32), terms-acceptance.functions.ts (30), ai-filing.functions.ts (13), document-settings.functions.ts (11), invitation-email.functions.ts (6), admin-invite-email.functions.ts (5)
- [ ] Batch 7 — Admin UI (~140): routes/admin.administrators.tsx (23), admin.accounts.tsx (17), admin.invitations.new.tsx (12), admin.agencies.$id.tsx (8), admin.audit.tsx (5), admin.quotes-invoices.tsx (5), admin.administrators.$id.email-preview.tsx (4), admin.reporting.tsx (4), admin.index.tsx (3), admin.my-account.tsx (3), admin.talent.$id.tsx (2); components/admin/* (54)
- [ ] Batch 8 — Tests and mocks (22): components/shared/ai-filing-review-modal.test.tsx (19), lib/document-quarantine.test.ts (2), lib/account-guard.test.ts (1)
