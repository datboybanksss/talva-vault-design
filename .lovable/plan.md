# Admin Reports redesign

## What changes for the admin
One **Reports** area for investment reporting and day-to-day follow-up, with shared filters, downloadable evidence and controlled access. Ship useful reporting first; add discount tracking, investor reporting and messaging in later, separately checked phases. No application code or data changes in this review.

## Checks and gaps confirmed
- Reporting and “Launch reports” are currently sections of `/admin/reporting`; launch settings are inside Launch reports. There is also a separate Terms acceptances page. Merge the reporting sections, rename navigation to Reports and preserve old links.
- **North star is not sign-in OR vault action on both sides today.** Talent qualify through either; agencies qualify through actions tied to that talent relationship, not staff sign-ins. Keep relationship-based measurement pending the decision below; never silently broaden it.
- **Retention needs replacing:** today it accepts login OR vault activity anywhere from joining through day 30/60/90. The approved rule is sign-ins only in the trailing 30-day window at each checkpoint, against registered people, with immature cohorts “Not yet due”.
- **Launch identification:** no invitations created, first sent or last sent on 18 Nov 2026 were found. Recorded sources are Admin or missing; 32 older agency/agency-talent invitations lack first-send timestamps. No launch-sheet marker exists. Date alone would not prove sheet membership even if invitations were present. No eligible membership list can currently be established.
- Thirteen talent profiles exist, four without activation dates. Three of those four match an accepted invitation; one does not through the inspected links. Activation dates will no longer exclude them; missing registration evidence/dates must remain disclosed, not invented.
- There are 138 historical logins; latest 15 Nov, first 14 Sep. None carry the new session marker. Secure-capture timestamp is 24 Nov 2026, 19:21 UTC; no successful-code visits are recorded. These checks do not establish deployment completeness or genuine inactivity since launch.
- Current report reads require Admin, not the proposed six permissions. Five admins have existing edit rights; one is Main administrator. Broad Admin policies expose profile/billing/legal data directly, so hiding controls alone cannot enforce Reports privacy.
- No dedicated saved-view, discount, spend, consent, message-history, incident or report-download-history tables were found. Existing email send history is empty; historical two-step proof is absent from login rows.

## Delivery phases
Every phase includes its own raw downloads, definitions, permissions tests and screen checks; no phase ships figures without their supporting records.

### 1 — Reliable foundations and one Reports area
**Admin value:** consistent numbers, reusable sign-in cards and a People list immediately.
- Tabs in exact order: **Overview · Growth · Engagement · Agencies · People · Business · Data exports · Launch admin**. Introduce the common frame; later-phase sections show honest availability notes, never fake figures.
- Sticky filter bar: Last 7/30/90 days, This month, Last month, Since launch, All time, Custom; Previous equal period / Same period last month / None; Real/Test/All (Real default); All/Agency staff/Talent/Trusted contacts; multi-agency; All/Agency-linked/Independent talent; All/TalVault admin/Agency/Waiting list/Launch sign-up sheet; joined month; Any/Active/Paused/Suspended. Reset, copy URL and private saved views per admin. Carry selections between tabs.
- Query-backed summary: dates, comparison, scope, “South African time” and first recorded sign-in date. Separately disclose complete-capture gaps; first observed login is not proof of complete tracking. All-time comparison and incompatible filters need the decisions below.
- Implement Definitions v1.0, dated **24 Nov 2026**, verbatim in one versioned source. Registered means accepted invitation plus account creation. Talent onboard after their first qualifying document; an agency after any staff member invites its first talent. Staff are registered only. Replace activation-based/link-based reporting denominators, not account status or onboarding screens. Include the four profiles normally; flag missing evidence without fabricating dates.
- Sign-in active/returning/dormant/retention/monthly-active share use **registered staff/talent**. Admin → excluded, then staff, then talent. Contacts remain separate visits, identified privately by normalised email and scoped through the sharing talent before deduplication.
- Reuse SignInCards, profile drawer, report-scope, raw drawer and print helpers. Extend People with stage/activity/search filters, server sorting/paging, columns and selection across pages. Fields: name, type, agency, status, joined, stage, last sign-in, days since, days active, sign-ins, documents, discount status/keep-by. Pending invitees are prospects, not invented registered accounts; contacts have visit equivalents.
- “How this is calculated” and CSV on every section; count proportions, “Small sample” below five people, arrow + increase/decrease/unchanged comparison words. Unknown history = “Not tracked”/“Not recorded”, not zero. Monetary/event totals need meaningful context rather than invented percentages.
- Start Reports access controls before exposing new data. Stabilise sign-in capture and verify all completion paths before any discount-loss logic.

### 2 — Overview, Growth, Engagement and Agencies
**Admin value:** acquisition, return usage, bottlenecks and agency support in one place.
- **Overview:** north star after definition decision; Active, Returning, Onboarding rate, Invitations accepted, Dormant cards; talent funnel; Needs attention for dormant people, waiting invitations, document-free talent, agencies with no talent invites and later discount risk.
- Shared day/week/month trends: active users & registrations; sign-ins & active days; uploads; invitations sent & accepted. Monday–Sunday weeks; current incomplete week lighter and explicitly labelled partial. Growth also has invitations versus registrations.
- **Growth:** progress versus stored launch targets; projection from four complete weeks, unavailable if insufficient history; source/status tables with acceptance rates/median time; Talent/Agencies funnel switch. Connection requests separate; drafts/resends do not create sent invitations.
- Funnel: sent → registered → uploaded/invited → returned on a second separate day. Show count, % previous/% sent, median transition delay and stopped people. Use a fixed invitation cohort and cutoff so stages reconcile; onboarding rate = onboarded ÷ registered.
- **Engagement:** staff/talent/contact switch; weekday/hour/device/new-device breakdowns; joining-month 30/60/90 retention; vault depth; upload/shared/private/type/60-day-expiry metadata; contact recipients, shares, visits and document view/download events. No document contents or access links.
- **Agencies:** cards; search/sort/health filter/column chooser; staff, active staff, invited/registered/active talent, documents, invoiced, last activity, health. Row detail reuses the same calculations, scoped to that agency. Health follows the approved thresholds; resolve overlaps/zero-talent cases below.
- All metric clicks open People with contributor filters; retain a matching raw-record drawer for relationships, documents, invitations and money, whose counts are not person counts.

### 3 — Launch admin and permanent discount tracking
**Admin value:** verified offer membership and advance warnings, without wrongful loss.
- Move existing offer places, Terms reports and launch settings into Launch admin. Keep the six-month-free offer separate from the new lifetime discount. Preserve legal proofs, invitation tokens/expiry and Test exclusions from offer allocation.
- Add blank plan prices; no assumed prices. Owner imports/marks the verified event-sheet list: secure upload, match existing invitation IDs, review unmatched/duplicates and original send evidence, confirm and audit. No automatic qualification by email/date guesses or new invitations.
- Freeze qualifying marker and evidence: launch-sheet membership, original 18 Nov invitation time, registration within 48 hours, account/agency identity and 20% lifetime discount. Qualification cannot drift with later source/email edits or resends.
- Keep-by = six **calendar** months after last completed sign-in, initially registration; agency uses any staff sign-in. Kept, At risk (≤30 days), Lost permanently dated, Reinstated by Owner with reason/audit. Holding ÷ all members is discount retention. No loss before **18 May 2027**.
- Update activity entitlement atomically with the idempotent login record. A scheduled, locked/rechecked expiry operation records loss only with reliable observation; failures/gaps hold loss for review, never treat missing logs as inactivity. Later sign-in cannot undo Lost. Deadline/reinstatement details await approval below.
- People, Needs attention and Business link to members/status history; messages become available in phase 5.

### 4 — Business and comprehensive exports
**Admin value:** reproducible investor pack and POPIA download evidence.
- **Business is Real-only regardless of Accounts selection**, stated in helper text. Investor PDF, monthly series since launch, definitions v1.0 and dictionary share one fixed snapshot. Other filter applicability needs approval.
- Accounts = registered talent + registered agencies, one per agency; MoM growth, monthly active share, committed revenue. Distinguish TalVault revenue from agency invoices. Paid plans start in 2027; do not build payments. Prices remain unset until supplied; commitment figures unavailable until prices and plan commitments exist.
- Free-period accounts, discount holdings and revenue by free-period-end month; discount Kept/At risk/Lost/earliest keep-by; monthly growth; talent-per-agency, agency-sourced share, registered talent-per-agency, median first-invite delay; monthly acquisition spend/channel; adoption; trust/security; data quality. Uptime remains a labelled placeholder, never an invented percentage.
- All listed datasets, one row per record: **People, Sign-ins, Trusted-contact visits, Invitations, Onboarding funnel, Retention, Documents metadata, Shares, Agencies, Quotes and invoices, Terms acceptances, Launch offer, Launch discount members + dated changes, Messages sent, Monthly metrics**.
- CSV/Excel, current filters or full history/all accounts subject to permission; ZIP everything with dictionary, definitions, scope/coverage manifest. Log when/admin/dataset/filters/email inclusion/rows. Filtered exports include every matching page, not only visible rows.
- Historical failures/incidents/two-step cannot be reconstructed reliably. Add future event proof and incident entry; older values unavailable. Device classification is an approximation, not a unique physical device.
- Monthly report email is optional: generated PDF/data require an automated renderer, not today’s browser print. Built-in app emails cannot attach files; use protected expiring links or an approved external delivery option.

### 5 — Controlled messaging
**Admin value:** address-hidden follow-up and accountable approvals.
- From selections: seven requested templates, subject/body, safe merge fields, Service/Marketing, exclusions count, test-to-self, schedule/send and history. Store content/recipient snapshot; recheck consent/suppression/access at send time. More than 25 eligible recipients require a different authorised admin’s approval; edits invalidate approval. Avoid duplicate sends on retries.
- Come-back/dormant and promotional discount emails are re-engagement/marketing: **cannot use Lovable’s built-in app-email service**, even labelled Service. Use a dedicated marketing service with explicit opt-in; suppress opted-out recipients. Specific expected service-event emails can retain the app-email channel and mandatory unsubscribe footer.
- Signed provider events supply delivery/open status where available. Opens are unreliable due to privacy protection. “Came back within 7 days” means an observed sign-in, not proof the email caused it; contacts cannot be measured as account sign-ins.

## Technical design and safeguards
- Shared typed URL/filter contract and versioned definitions; database RPCs aggregate, filter, sort and page. Replace unbounded report reads, reuse action/time and actor/time indexes, add joins/indexes only with query-plan evidence. Reconcile cards → contributors → raw records → exports. Freeze cutoff, definition version and dataset snapshot for investment/download reproducibility.
- Additive model: Reports role grants; private saved views; registration/stage evidence with provenance; fixed source markers/import audit; discount members + append-only transitions; effective-dated plan prices/commitments; spend channels/months; consent/suppression evidence; messages/recipients/approvals/delivery events; export jobs/history and security events/incidents. Keep identity in existing account records; roles never on profiles. Snapshot future membership/test/status changes; label older current-state attribution.
- Guarded migrations through the migration tool, explicit grants then RLS; retain the project’s guarded history copy and rollback notes. No account deletion, invented events or changes to existing two-step enforcement/security headers. Rollback disables new features without erasing proof/history.
- Private server projections remove emails, including embedded addresses, before responses. Authorised inclusion requires permission **and an explicit tick**; messaging resolves addresses only on server. Never export ID/DOB/tax numbers, storage paths/tokens, codes/passwords or document contents. Formula-safe CSV/Excel.
- Permission matrix:

| Role | View | Raw download | Emails | Message | Approve >25 | Manage access |
|---|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Operations | Yes | Yes | No | Yes | Yes | No |
| Analyst | Yes | Yes | No | No | No | No |
| Viewer | Yes | No | No | No | No | No |

Only existing Admins qualify; Owner manages Reports access and all changes are audited. Proposed bootstrap: existing Main administrator becomes Owner; others await explicit assignment. Protect the last Owner. Enforce functions, RPCs, jobs and direct database access; legacy broad Admin reads must not bypass the six permissions. Audit implications for other Admin screens before rollout.
- Reuse existing controls/tokens/Lucide; accessible info dialogs, keyboard/focus states, light/dark. Phone Filters (n), scrolling tabs and internally scrolling tables; one primary action per view. Print follows tab order. Worker-compatible PDF/Excel/ZIP tooling and bounded background jobs for large exports; private downloads recheck permission, expire and have agreed retention.

## Open decisions and release gates
1. North star: preserve relationship-specific agency actions, or let any staff sign-in qualify all that agency’s eligible relationships? Define eligible links and whether unregistered invitations belong in the denominator.
2. Confirm legacy registration-date evidence; qualifying upload means talent-owned upload (not Admin proof/agency upload), whether versions/copies count, and whether onboarding remains reached after deletion. Proposed: validated talent upload, stage permanent.
3. Health precedence and agencies with zero talent? Funnel return means second lifetime SAST day; returning cards retain 2+ period days. Confirm trailing retention day boundaries and contact grant-cohort presentation.
4. Filters: same-month comparison month-end clamping/overlap; All-time comparison; contacts’ inapplicable account status; agency/source/join filters on Business. Recommended Business investor headline unsegmented except date, separately labelled breakdowns.
5. Supply verified launch sheet/original send evidence; agency-versus-person membership, loss boundary/grace and post-reinstatement deadline. No losses until capture is proven reliable. Clarify “paying accounts 0” is pre-paid-launch only, not a permanent fabricated number.
6. Plan prices/currency/VAT/effective date and what proves committed revenue; spend channels/CAC denominator, feature-adoption eligible bases, incident policy and export/history retention.
7. Initial Reports role assignments/custom permission grants; permission consequences for other Admin screens; View-only PDF allowance. Choose marketing provider/consent evidence, scheduling timing, open tracking and optional monthly email delivery.

Tests cover each approved rule, SAST/month ends, immature/missing coverage, independent/multi-role/multi-agency scope, four legacy profiles, 48-hour qualification, six-month deadlines, lost-state permanence, logging outage/races/retries, permissions/direct reads, suppression/approval and all-page snapshot export reconciliation. Full tests/lint/strict typing/build; signed-in Admin desktop/mobile/light/dark and real completion/download flows using authorised Test accounts only. Report every unchecked flow and provider/performance blocker. Never alter or delete Test accounts.
