# Sign-in metering in Admin → Reporting

Plan only; no code, accounts, database or security settings change before approval.

## Verified findings

- **138 login rows / 15 actors**: Agency staff **29/6**, Talent **62/5**, Admin **46/3**, unresolved **1/1**. The unresolved actor has no remaining account/profile/membership/role: retain history, exclude from typed figures with a helper note.
- First observed login: **14 Sep 2026** overall/staff, **15 Sep 2026** talent. These are observed events, not proof of complete capture; displayed tracking dates come from queries.
- **11 agency members; 13 talent profiles**. Nine profiles have activation completion timestamps; four lack them (three Real, one Test). Existing onboarded-talent reporting is agency-link-based and excludes independent talent, so cannot supply this denominator unchanged.
- Only Admin rows currently exist in user_roles (five); no loved_one roles, agency/talent overlap or multi-agency staff membership.
- Contacts access public share links with codes, without recipient actor_id. Recipient emails can separately hold accounts (two Admin, one Talent today). **Six shares / three recipient emails / zero access events**. Code acceptance is not logged; list reads log opened and file-link requests can log view/download. These are not account sign-ins.
- MFA is currently OFF: password-only completion counts. Keep the switch and all security requirements unchanged.

## Identity and calculations

Resolve actor_id through profiles, Admin roles, agency_members and talent_profiles. Recommend **exclude Admin → Agency staff → Talent**, one type per profile, matching portal priority without double counting. Preserve unresolved history.

Roster: registered staff (owners included) with recorded invitation/onboarding evidence; completed talent, both independent and linked, once per user. Use recorded completion dates. Keep four older unconfirmed profiles separate pending approval.

Recommend contacts as separate **visits**: successful access-code entries, deduplicated people by lower-cased/trimmed email. Denominator = recipients sent code-protected access by cutoff, including never visited, labelled **recipients given access**, not onboarded accounts. Never fabricate accounts or login rows. This measures designated recipients, not independently verified humans.

| Metric | Definition |
| --- | --- |
| Active users | At least one period login / total onboarded by cutoff, with %. |
| Returning users | Logins on **2+ distinct South African days** in period. |
| Total sign-ins | Eligible login rows; same-day completions count here. |
| Average days active | Sum distinct active days per person / active people; primary frequency metric. |
| Dormant users | No login for **30+ days** at cutoff; never signed in qualifies after 30 days onboarded. |
| Average sign-ins per week | Period sign-ins × 7 / selected calendar days; no minimum week. |

Use Africa/Johannesburg midnight boundaries (inclusive start/exclusive next-day end), immediately preceding equal-length period and each period's roster cutoff. Recommend cutoff = period end, or today if ongoing. First/last/days-since use recorded history up to cutoff; missing history shows Not recorded. Include paused/suspended onboarded users, exclude soft-deleted profiles. Contact calculations use visit equivalents.

## Implementation

### Database and history

- Preserve talent_audit_log. Add missing **(action, created_at)** index. Two equivalent **(actor_id, created_at)** indexes exist: reuse, without adding/removing duplicates here.
- SQL/RPC summaries and profile pages: aggregate/filter/sort/count/page in database, never fetch every audit event into server functions. LEFT JOIN roster so zero activity remains visible.
- Return typed current/prior values, denominators, coverage, total rows. Validate type/agency/sort/page inputs; stable profile-ID tie-breaker.
- New raw metric family sign_in_profiles with type/population (all/active/returning/dormant). General roster includes zero activity; clicked card rows match its qualifying rule.
- One row/person with applicable agency names. Filter by relationship existence, without duplicates. No active talent link = Independent. Disclose historical relationship gaps/current-state fallbacks.
- Admin and existing MFA/account gates inside RPCs and server; grants, safe search paths, no anonymous access/unrestricted privileged helpers or managed-auth changes.
- Conditional successful-code event in loved_one_share_access_events; reuse (share_id, created_at), add period/event index if justified. Never recast opened/view/download as sign-ins.
- Guarded migrations follow existing history conventions; deployment/rollback SQL restores previous functions/removes new objects/indexes/guards, never erases collected events.

### First sign-in — section 7 answer

Invitation first sign-ins are **not recorded by the inspected paths**. Agency/Talent/Admin invitation screens call signInWithPassword without the recorder. enroll-2fa and verifySignInCode do not log it. Regular auth recording is best-effort and can silently miss failed writes.

Reuse a server-only recording helper, preserving new-device notifications. Await authenticated recording after password-only success on auth/invitations before navigation; acceptance/account creation alone never counts. When MFA applies, record server code-verification success, including enrolment, remove duplicate client writes and never bypass verification.

New rows use server-validated session identity/database uniqueness for retry safety: refresh/navigation/retries do not count; genuine completions, including reauthentication, do. Reject arbitrary self-written login rows bypassing checks; retain other audit-action permissions. Check errors, safe diagnostics, bounded idempotent retries without breaking sign-in. Store no passwords/codes/tokens. Do not backfill from acceptance/creation/activity; disclose gaps and query complete-path tracking date after deployment.

### Test scope

Reuse loadTestScope/buildTestScope, Real/Test/All, default Real; SQL/helper parity tests. Staff inherit agency is_test; talent uses profile flag; contacts inherit **sharing talent's** flag, not recipient identity.

Recommend scoping share/events before email deduplication. Mixed-source recipients may appear once in Real and Test; All counts once, so sums may differ. None today. Global Test-wins is an alternative needing approval. Identical scope for current/prior cards, rows, filters and exports; never alter/deactivate/delete accounts.

### Server and UI

Extend admin-reporting.functions.ts, REPORTING_METRICS/getReportingRawRows with typed RPC results. Reuse period/prior pattern, SAST boundaries for these metrics only; unrelated figures unchanged.

**Sign-in activity** section, existing cards/tokens/components, grouped **Agency staff / Talent / Trusted contacts**:
- Account cards: **Active users; Returning users; Total sign-ins; Average days active; Dormant users**, each with prior comparison.
- Conditional contact cards: **Active recipients; Returning recipients; Total visits; Average days active; Dormant recipients**.

Extend raw drawer: server pagination, sorting, type/agency filters. Columns: **Name; Account type; Agency; Sign-ins in period; Days active; Average sign-ins per week; First sign-in; Last sign-in; Days since last sign-in**. Contacts use visit equivalents.

Export all filtered profiles, not only visible page (current drawer exports loaded rows), using bounded pages, consistent cutoff/sort and CSV-safe cells; include snapshot/PDF figures.

Query-derived Tracking since/helper notes, never banners. Pre-tracking = unavailable, not zero; suppress misleading comparisons. Dormancy needs 30-day observation coverage. Counts/names/options/metadata from queries; shared wording/terminology, UK/SA spelling, existing date format, no unrelated redesign/header changes.

### Tests and verification

SAST midnight; same-day versus two-day returns; exact 30-day dormancy; never signed in/newly onboarded; empty/short-period averages; cutoff/future exclusion; zero activity; independent talent; Admin/multi-role and multi-agency deduplication; flags/mixed-source contacts; Real default; SQL/helper parity; card/row/export reconciliation.

All completion paths, failed/incomplete auth, retry uniqueness, genuine completions, refresh exclusion, forged-login denial. RPC permissions/MFA, representative query plans, full tests/lint/strict typing/preview signals. Switch stays OFF; ON tests mocked/transactional. Existing Admin session for desktop/mobile/light/dark, drawer/export checks; no minted sessions or real-user Terms acceptance. Report blockers.

## Long-term audit home — section 7 answer

Keep physical storage; account-neutral reporting RPCs now, optional private read-only view later preserving permissions. No rename/drop here. Contacts retain share-access log: different identity/security model.

## Approval questions / risks

1. Separate contact visits rather than claimed account sign-ins? Question card supplied.
2. Keep four unconfirmed profiles separate or include with disclosed onboarding proxy? Question card supplied. Never estimate first-sign-in dates.
3. Approve type priority, period-end dormancy and paused/suspended inclusion?
4. Approve mixed-source contact scope and recipients-given-access denominator?

Missing earlier events, orphaned actor, changing memberships/test flags and email identity limit historical certainty. Preserve data and explain gaps rather than invent figures.
