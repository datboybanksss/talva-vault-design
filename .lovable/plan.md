# Admin Reports redesign

## What the admin gets
One Reports area for investment reporting and daily follow-up, with shared filters, downloadable evidence and controlled access. Reuse the sign-in cards, drill-down, report-scope, period/prior, raw-drawer and print patterns. Plan only: no application code or data changed.

## Confirmed findings
- Reporting and Launch reports are sections of `/admin/reporting`; consolidate them and preserve existing links, including Terms reporting.
- North star currently accepts talent sign-in OR vault action, but requires agency actions tied to that talent relationship. Staff sign-ins alone do not qualify: the requested both-sides interpretation needs approval.
- Current retention accepts sign-in OR vault activity anywhere from joining to day 30/60/90. Replace with approved sign-in-only preceding 30-day windows, registered base and Not yet due.
- No invitations created, first sent or last sent on 18 Nov 2026 were found. No sheet marker exists; sources are Admin or missing, and 32 older invitations lack first-send timestamps. Membership needs a verified sheet and original send evidence, not date guesses.
- Thirteen talent profiles exist; four lack activation dates. Three of those four match accepted invitations through inspected links. Stop activation exclusion; missing registration evidence/dates remain disclosed.
- 138 historical logins: first 14 Sep/latest 15 Nov, none with new session marker. Capture stamped 24 Nov 19:21 UTC; no contact visits recorded. Deployment/completeness is unverified; missing events cannot prove inactivity.
- Five edit admins, one Main administrator; broad Admin database reads currently bypass the proposed permissions. Dedicated saved-view, discount, spend, consent, message, incident and download-history tables were not found. Email-send history empty; historical two-step proof absent.

## Phases
### 1 — Foundation: useful reporting first
Build the eight tabs in the exact A order, full B filter bar and all C section conventions. Keep filters in the URL/shared across tabs, default Real, private saved views, sticky summary and query-backed tracking date. Distinguish first observed login from complete capture.

Introduce access/privacy enforcement and Definitions v1.0 before new downloads. Reuse sign-in reporting; replace activation/link-based reporting eligibility, not account status or onboarding screens. Include the four profiles normally; never invent dates.

People gets all D.5 metrics/columns, filters/search, server paging/sort, column chooser, cross-page selection, CSV/Excel and timeline. Include zero activity; unregistered invitees are prospects, contacts have visit equivalents. Messaging activates in phase 5.

Every figure opens contributing People, plus raw-record evidence where figures count money/documents/invitations/relationships rather than people. Small sample below five; arrow + words comparisons; missing history Not tracked/Not recorded, never zero. Monetary/event percentages need meaningful denominators.

### 2 — Core analytics
Deliver all D.1–D.4 cards/charts/tables: Overview/Needs attention, Growth/source/funnel, Engagement/sign-ins/retention/vault/documents/contacts, Agencies/detail. Each gets calculation info and full raw CSV evidence.

All four trend measure pairs/day-week-month grouping; incomplete current week lighter and labelled. Projection uses four complete weeks, unavailable without history. Funnel uses one invitation cohort/cutoff and all requested count/proportion/median/stopped-person measures. Drafts excluded, resends count once, connection requests separate. Metadata only, never contents. Resolve north-star/health choices before those figures ship.

### 3 — Launch admin and protected discount
Move existing offer places/Terms/settings to Launch admin; add blank prices, preserve Real-only offer allocation/proofs/links. Keep six-month-free offer separate from lifetime discount.

Owner imports/marks verified event sheet, matches invitation IDs, reviews unmatched/duplicates/send evidence, confirms/audits. Freeze sheet marker, original 18 Nov time, registration within 48 hours and account/agency identity. Resends/edits cannot change eligibility; no token/expiry changes.

Six-calendar-month keep-by from last completed login, initially registration; any agency staff login counts. Kept/At risk (≤30 days)/permanently dated Lost/Owner-only Reinstated with reason/audit. Holding/all members retention; no loss before 18 May 2027.

Update entitlement atomically with idempotent login recording. Scheduled expiry locks/rechecks concurrent logins and requires proven capture coverage. Outages/failures hold loss for review; later login cannot reverse Lost. Verify every completion path before enabling loss.

### 4 — Investor evidence and exports
Deliver every D.6 Business panel, always Real-only despite Accounts selection, explicitly stated. Board-ready PDF/monthly series/definitions/dictionary share a snapshot. Distinguish TalVault revenue from agency invoices; prices/commitments unknown means unavailable revenue. Paid plans start in 2027; no payments build. Earlier security history unavailable; uptime untracked, devices approximate.

All 16 D.7 datasets, one row/record, including discount members/dated transitions. CSV/Excel/current filters or full history/all accounts subject to access; ZIP/dictionary/coverage manifest/download history. Every matching row, not just visible pages.

Monthly email needs automated PDF generation, not browser print. Built-in app emails cannot attach PDF/data: protected expiring links or approved external delivery required.

### 5 — Controlled messaging
All E templates/composer/merge fields, Service/Marketing, exclusions/counts, test-to-self, scheduling/send/history. Snapshot content/recipients, recheck consent/suppression/access at send. More than 25 eligible recipients need another authorised admin’s approval; edits invalidate approval; retry-safe sends.

Re-engagement/marketing cannot use Lovable’s built-in app-email service, even labelled Service. Dormant/come-back/promotional messages require a dedicated marketing service and opt-in evidence. Expected service-event mail retains app-email rules/unsubscribe footer. Provider events supply delivery/open status where supported; opens unreliable. Seven-day return is observed sign-in, not causal proof; contacts have visits.

## Definitions and data model
Implement G verbatim in one shared versioned source, v1.0, 24 Nov 2026, used by info buttons/dictionary/investor pack. Registered people base sign-in figures; Admin excluded → Staff → Talent. Contacts remain successful-code visits, privately deduplicated after sharing-talent scope. Staff inherit agency test flags. Paused/suspended included unless filtered.

SAST/Monday–Sunday/period-end-or-now throughout. Missing capture cannot establish inactivity. Add registration/stage evidence without inventing historical events.

Additive records: Reports grants/private views; fixed source/import proof; discount members/append-only changes; effective-dated prices/commitments; spend/channels; consent; messages/recipients/approvals/provider events; export jobs/history; security events/incidents.

## Permissions and technical safeguards
| Role | View | Raw download | Emails | Send | Approve >25 | Manage access |
|---|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Operations | Yes | Yes | No | Yes | Yes | No |
| Analyst | Yes | Yes | No | No | No | No |
| Viewer | Yes | No | No | No | No | No |

Settings → Reports access, existing Admins only. Proposed Main administrator → Owner; explicitly assign others/protect last Owner/audit changes. Server/RPC/jobs/database enforcement closes broad Admin bypasses; assess other Admin-screen effects. Roles never on profiles.

Typed URL/filter contract; database aggregation/paging replaces unbounded reads. Reuse indexes/check query plans. Freeze cutoff/definitions/data snapshot; reconcile cards→People→raw rows→exports. Snapshot future membership/test/status changes; disclose older current-state attribution.

Email permission plus explicit tick; otherwise strip columns/embedded addresses before server responses. Messaging resolves addresses privately. No ID/DOB/tax, passwords/codes, storage paths/tokens or contents. Formula-safe CSV/Excel; bounded export jobs/private expiring downloads/permission rechecks. Log time/admin/dataset/filters/email yes-no/rows.

Worker-compatible PDF/Excel/ZIP; guarded migrations/grants/RLS/project history copy/rollback preserving evidence. No two-step/security-header changes, never alter/delete Test accounts. Existing components/tokens/Lucide/accessibility; phone Filters (n), scrolling tabs/tables inside their box; one primary action/no banners/print tab order.

## Open questions and release gates
1. North-star agency-login expansion/eligible links; health precedence/zero-talent agencies.
2. Legacy registration evidence; qualifying upload ownership/versions/copies/deletion. Proposal: validated talent upload, not Admin proof/agency upload; onboarding stays reached. Retention day boundaries/contact cohorts?
3. All-time comparison/month-end clamping/overlap, inapplicable filters/Business segmentation; People contributors plus raw evidence for non-person figures.
4. Verified sheet/send times; agency-versus-person membership, loss deadline/grace/reinstatement keep-by. Paying-accounts zero means before paid launch, not forever.
5. Prices/currency/VAT/commitment evidence; spend channels/CAC base, vault-depth/adoption definitions, incident policy/export-history retention.
6. Initial access/custom grants/other Admin-screen effects/Viewer PDF allowance; marketing provider/consent/open tracking/schedule timing/monthly-email format.

Each phase includes raw evidence/tests/access checks/signed-in desktop/mobile/light/dark verification. Test every approved rule, SAST/month ends, four legacy profiles, coverage/retention, role/test/multi-agency scope, 48-hour eligibility, six-month/permanent loss, outages/races/retries, direct-access denial, suppression/second-admin approval and snapshot reconciliation. Full tests/lint/strict typing/build; authorised Test-account completion/download flows. Report unchecked flows/provider/performance blockers. Missing past history cannot be recovered.
