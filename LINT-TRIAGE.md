# Lint triage — 20 October 2026

## Validation

- Before: 9,338 errors, 37 warnings (9,375 total).
- After formatting-only source pass: 3,960 errors, 37 warnings.
- After safe fixes and generated-file exclusions: 853 errors, 31 warnings (884 total).
- Formatting-only stage: 69 tests passed across nine files; automatic validation reported build OK.
- Final stage: 69 tests passed across nine files; automatic type-check/build reported build OK.
- CI lint is now blocking; it will fail until the remaining error-level type debt is resolved.
- Stateful Git operations are platform-managed: no separate formatting commit was created manually. The formatting-only patch was preserved under /tmp for inspection.

## Scope and exclusions

Authored src files were formatted with Prettier; e2e/public.spec.ts was formatted separately to remove its existing formatting errors. Managed integration files and routeTree.gen.ts were not rewritten; ESLint now explicitly excludes that generated output. No lint rules were weakened or disabled to conceal authored-code debt.

## Decisions required

### react-hooks/exhaustive-deps (2 warnings)

- src/components/admin/talent-invite-form.tsx:99 — effect hydrates editable fields on invitation ID change. Adding the full invitation object could overwrite unsaved edits on refetch.
- src/routes/admin.invitations.new.tsx:97 — analogous draft hydration effect; adding draftRow could reset edits.

### @typescript-eslint/no-explicit-any (853 errors)

Accurate types need incremental review. Global unknown replacement would require runtime narrowing, potentially changing error handling or existing accepted inputs. Remaining counts by file:

| File | Findings |
|---|---:|
| `src/components/admin/admin-shell.tsx` | 3 |
| `src/components/admin/talent-invitation-actions.tsx` | 5 |
| `src/components/admin/talent-invite-form.tsx` | 16 |
| `src/components/agency/agency-profile-panel.tsx` | 2 |
| `src/components/agency/agency-shell.tsx` | 2 |
| `src/components/agency/billing-sender-card.tsx` | 4 |
| `src/components/agency/client-detail-panel.tsx` | 4 |
| `src/components/agency/clients-panel.tsx` | 4 |
| `src/components/agency/document-rules-panel.tsx` | 9 |
| `src/components/agency/folder-templates-panel.tsx` | 4 |
| `src/components/agency/invoice-payments-dialog.tsx` | 4 |
| `src/components/agency/manage-folders-panel.tsx` | 4 |
| `src/components/agency/quotes-invoices-settings-panel.tsx` | 13 |
| `src/components/agency/talent-link-actions.tsx` | 4 |
| `src/components/agency/vault-requests-panel.tsx` | 7 |
| `src/components/shared/ai-filing-review-modal.test.tsx` | 19 |
| `src/components/shared/ai-filing-review-modal.tsx` | 4 |
| `src/components/shared/onboarding-tour.tsx` | 8 |
| `src/components/shared/preview-dialog.tsx` | 1 |
| `src/components/shared/row-actions-menu.tsx` | 3 |
| `src/components/shared/terms-gate.tsx` | 1 |
| `src/components/shared/use-analyse-with-ai.ts` | 1 |
| `src/components/talent/security-log-panel.tsx` | 3 |
| `src/components/talent/talent-shell.tsx` | 10 |
| `src/components/talent/vault-folders-panel.tsx` | 2 |
| `src/lib/admin-print.ts` | 3 |
| `src/lib/admin-reporting.functions.ts` | 38 |
| `src/lib/admin.functions.ts` | 79 |
| `src/lib/agency-activation.functions.ts` | 1 |
| `src/lib/agency.functions.ts` | 188 |
| `src/lib/ai-filing.functions.ts` | 13 |
| `src/lib/billing-email.server.ts` | 1 |
| `src/lib/document-ai.server.ts` | 3 |
| `src/lib/independent-talent.functions.ts` | 19 |
| `src/lib/invitation-email.functions.ts` | 6 |
| `src/lib/invitation-email.server.ts` | 4 |
| `src/lib/invitation-status.ts` | 2 |
| `src/lib/invite-claim.functions.ts` | 2 |
| `src/lib/legal-acceptance.server.ts` | 1 |
| `src/lib/link-notify.server.ts` | 5 |
| `src/lib/link-requests.functions.ts` | 3 |
| `src/lib/loved-one.functions.ts` | 19 |
| `src/lib/onboarded-talent.ts` | 8 |
| `src/lib/talent-activation.functions.ts` | 4 |
| `src/lib/talent-activity.server.ts` | 1 |
| `src/lib/talent-audit.functions.ts` | 7 |
| `src/lib/talent-vault.functions.ts` | 3 |
| `src/lib/talent.functions.ts` | 14 |
| `src/lib/terms-acceptance.functions.ts` | 26 |
| `src/lib/terms-guard.ts` | 3 |
| `src/routes/admin.administrators.$id.email-preview.tsx` | 4 |
| `src/routes/admin.administrators.tsx` | 23 |
| `src/routes/admin.agencies.$id.tsx` | 9 |
| `src/routes/admin.agencies.index.tsx` | 14 |
| `src/routes/admin.audit.tsx` | 5 |
| `src/routes/admin.index.tsx` | 5 |
| `src/routes/admin.invitations.$id.email-preview.tsx` | 3 |
| `src/routes/admin.invitations.index.tsx` | 21 |
| `src/routes/admin.invitations.new.tsx` | 12 |
| `src/routes/admin.my-account.tsx` | 3 |
| `src/routes/admin.quotes-invoices.tsx` | 5 |
| `src/routes/admin.reporting.tsx` | 4 |
| `src/routes/agency.contracts.$id.tsx` | 6 |
| `src/routes/agency.document-requests.tsx` | 1 |
| `src/routes/agency.document-vault.tsx` | 12 |
| `src/routes/agency.index.tsx` | 2 |
| `src/routes/agency.invitations.$id.email-preview.tsx` | 3 |
| `src/routes/agency.invitations.tsx` | 28 |
| `src/routes/agency.my-account.tsx` | 3 |
| `src/routes/agency.quotes-invoices.tsx` | 24 |
| `src/routes/agency.talent.index.tsx` | 6 |
| `src/routes/agency.talent.invite.tsx` | 2 |
| `src/routes/api/public/hooks/talent-reminders.ts` | 1 |
| `src/routes/api/public/loved-one-file.ts` | 2 |
| `src/routes/auth.tsx` | 4 |
| `src/routes/invite.$token.tsx` | 2 |
| `src/routes/invite.admin.$token.tsx` | 2 |
| `src/routes/invite.talent.$token.tsx` | 3 |
| `src/routes/lovable/email/queue/process.ts` | 5 |
| `src/routes/loved-one.$token.tsx` | 10 |
| `src/routes/talent.index.tsx` | 2 |
| `src/routes/talent.notifications.tsx` | 5 |
| `src/routes/talent.requests.tsx` | 1 |
| `src/routes/talent.settings.tsx` | 3 |
| `src/routes/talent.sharing.tsx` | 16 |
| `src/routes/talent.vault.tsx` | 12 |

### react-refresh/only-export-components (29 warnings)

These mixed helper/component exports require module separation; left unchanged to avoid structural churn.

- `src/components/agency/agency-profile-panel.tsx`: 14
- `src/components/agency/client-detail-panel.tsx`: 11, 19
- `src/components/agency/clients-panel.tsx`: 136
- `src/components/agency/document-rules-panel.tsx`: 36, 41, 50
- `src/components/agency/folder-templates-panel.tsx`: 30, 35
- `src/components/agency/manage-folders-panel.tsx`: 43
- `src/components/agency/vault-requests-panel.tsx`: 51, 55
- `src/components/brand/talvault-logo.tsx`: 8
- `src/components/shared/country-select.tsx`: 10
- `src/components/shared/email-chips-input.tsx`: 6
- `src/components/shared/entity-card.tsx`: 20, 30
- `src/components/shared/invite-account-gate.tsx`: 34
- `src/components/shared/onboarding-tour.tsx`: 27, 27, 27
- `src/components/shared/theme-toggle.tsx`: 14, 20
- `src/components/ui/badge.tsx`: 32
- `src/components/ui/button.tsx`: 49
- `src/components/ui/form.tsx`: 163
- `src/components/ui/navigation-menu.tsx`: 111
- `src/components/ui/sidebar.tsx`: 743
- `src/components/ui/toggle.tsx`: 42

### Unused declarations outside enabled rules

The existing no-unused-vars rule remains disabled. Unused imports were removed while preserving module evaluation; unused BUCKET/managerIds were removed. Retained declarations whose removal could alter subscriptions, queries or dead-code structure:

- src/components/shared/onboarding-tour.tsx: pathname router subscription.
- src/lib/admin-reporting.functions.ts: prior-period calculation (before).
- src/routes/agency.index.tsx: activity filter/setter, derived activity, mapping and unused RecentTalentActivity component.

## Safe fixes

- Removed unused named imports, retaining side-effect imports when the last binding disappeared.
- Stabilised fallback arrays/count maps in memo dependencies for Admin invitations and Terms reports.
- Stabilised filing analysisKey and made the timer effect depend on that same key.
- Used the inferred mutation Error type in the AI preference card.
- CI no longer continues after lint errors.
