# Sign-in metering

## What is counted

- `talent_audit_log.action = 'login'`: one completed password-only sign-in when the existing two-step switch is off, or one successfully verified code completion when it is on. The server checks the existing switch; no setting is changed.
- New login rows carry the verified JWT `session_id`. A database unique index makes the same session idempotent across RPC/navigation/network retries. New password sign-ins create new auth sessions. A token refresh or page mount is not a completion and never calls the recorder.
- Auth, agency/talent/admin invitation activation and code enrolment all use the same recorder. Admin events remain in security history but are excluded from account usage figures.
- `loved_one_share_access_events.event = 'successful_code'` is written after a valid access code, before issuing the share ticket. Each successful entry is a **visit**, not an account sign-in. Failed codes, list reads, document views and downloads are not visits.
- Account creation/invitation acceptance alone never counts. No historical events are fabricated or backfilled. Errors are checked; the completed-sign-in recorder retries once and emits safe diagnostics without failing a completed sign-in. Contact logging remains best-effort to preserve recipient access.

## Identity, scope and calculations

- Priority: exclude any Admin role, then Agency staff (including owners), then Talent. Staff need recorded acceptance or Terms evidence; talent require `activation_completed_at`. Profiles with no activation completion are counted in a helper note, never given proxy dates.
- Paused/suspended people remain in denominators. Soft-deleted talent and deleted/orphaned account identities are excluded; historical audit rows remain intact. Staff currently have no soft-delete field; surviving profile/membership provides the staff roster.
- Staff inherit the related agency test flag. Talent use their own test flag. Trusted contacts inherit the sharing talent flag. Scope shares/events **before** lower/trim email deduplication. One recipient in mixed-source shares may appear once in both Real and Test, but once in All. Account roles on the recipient's email do not turn a visit into a login.
- Contact denominator: **recipients given access**, including never-visited, expired and revoked shares already created by cutoff with a code hash; no disclosure of recipient email in new report responses.
- Staff with multiple agencies are deduplicated within scope. Talent active links supply current agency labels; no active link means Independent. Memberships, links, names and test flags are current records, not reconstructed historical snapshots.
- Periods use Africa/Johannesburg inclusive midnight start/exclusive next-day end. History is truncated at selected period end, or today/now for ongoing periods. Future events are excluded. Prior period is the immediately preceding equal number of calendar days with its own roster cutoff.
- Active: at least one event; returning: at least two distinct SAST days; sign-ins/visits: row count; average days: total per-person active days divided by active people; weekly average: events × 7 / selected inclusive calendar days.
- Dormant: last event 30+ calendar days before cutoff; never signed in qualifies once onboarding/access grant is 30+ days old. Displayed dormancy/comparisons are withheld until complete observation coverage. Earlier observed activity may be shown as partial, never represented as complete absence.

## Access, aggregates and downloads

- Admin-only SQL `admin_sign_in_people`, `admin_sign_in_summary`, `admin_sign_in_page` enforce Admin, account and existing MFA checks, even through direct RPC calls. No anonymous execution. Server calls use the authenticated client, not an admin read bypass.
- `(action,created_at)` and `(event,created_at)` indexes added; existing duplicate actor/time indexes untouched. New unique `(actor_id,sign_in_session_id)` index covers session-tagged login rows only.
- A security-invoker trigger blocks authenticated callers from forging, altering or deleting login rows; other audit actions keep their existing policies. The server-validated security-definer recorder takes no actor, timestamp or token input.
- Cards and drawer are reusable outside Reporting for the later tab reorganisation. No tabs are created in this phase. `sign_in_profiles` joins the existing raw metric family.
- Profile pages sort/filter/count/page in SQL. Zero-activity onboarded users remain in the general roster. Card drill-down populations match their qualifying rules.
- CSV and printable PDF use all bounded filtered pages, one fixed report cutoff and stable sorting. Export aborts on a count mismatch/empty intermediate page rather than silently downloading a partial report. Current membership/name/test-flag changes can still change a report between calls; historical snapshots are not available.
- All Admin raw CSV downloads omit email columns and redact addresses embedded in other fields by default. New printable profile exports apply the same redaction. CSV cells neutralise spreadsheet formulas. Legal records/emails stored in the database are not changed.

## Deployment and verification

1. Apply `0025_sign_in_metering` through the migration tool. The guarded copy in `supabase/migrations/20261124191700_sign_in_metering.sql` is byte-identical. Repeat application keeps the original capture timestamp and existing history.
2. Publish all matching recording/UI/export code together. The existing published app does **not** receive frontend changes merely because the database migration ran; its old direct login writer is now refused by the guard. No sign-in is blocked, but the old version will miss login records until published.
3. The database-stamped capture timestamp records when the secure recorder was enabled, not proof of deployment to every browser. Capture completeness still requires the matching published code; existing open clients may need to refresh. Do not claim earlier best-effort login history is complete.
4. Run the retained focused SQL and unit tests, then full suite/lint and automatic validation. SQL fixtures copy installed functions onto temp tables and mock auth/MFA context; they never create real accounts, accept Terms, mint sessions or flip the switch.
5. With an already available Admin session, check Reports and each drawer filter/export at desktop/mobile in light/dark. With authorised existing Test credentials, sign in by each password/invitation/code path and confirm exactly one new login row; refresh/retry should not add one. Enter a Test share code and confirm one new successful-code event, with wrong codes/view/download excluded. Without those sessions/codes, disclose this as unverified.
6. Confirm `platform_settings.value` for `mfa_enforced` is unchanged. Inspect query plans against production-sized history before assuming small-fixture performance predicts scale.

## Verification result — 24 November 2026

- Full suite: 410 passed, five existing skips. 26 focused tests passed, including installed SQL on temporary fixtures, four excluded profiles (All 4 / Real 3 / Test 1), SAST day/dormancy boundaries, role priority, mixed-source recipients, retry uniqueness, forged-login refusal, server paging and email-free exports.
- Lint: zero errors / 43 existing warnings; remaining lint targets clean. Automatic TypeScript/build validation passed. The two-step setting was read back as false; it was not changed.
- Actual signed-in Admin desktop/mobile/light/dark, drawer/download, invitation/password/code completion and trusted-contact code-entry flows were not verified: the existing-self session command reported a session but its file was absent, and both restoration methods left the browser signed out. No test account was created and no Terms accepted. Production-scale query-plan checks remain outstanding. No signed-in screenshots are claimed.

## Rollback procedure

Revert UI/export/completion code together first; then apply the commented rollback SQL at the end of the guarded migration. It removes the new RPCs, writer/trigger and newly added indexes. Keep `sign_in_session_id`, the capture timestamp function and collected login/visit events; do not erase history, rewind sessions, reconstruct missing logins or alter the two-step switch. The prior writer can again use its existing self-audit INSERT policy once the guard is removed. No account data or states were changed.
