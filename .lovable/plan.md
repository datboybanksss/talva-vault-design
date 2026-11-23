# Sign-in metering in Admin → Reporting (plan only)

## Findings that change the requirement (please read first)

1. **Trusted contacts have no accounts and never "sign in".** A trusted contact opens a share link and enters an access code; no login row is written for them, and no trusted-contact user exists in the sign-in system. Their equivalent is "opened a shared link with the right code", recorded per share in `loved_one_share_access_events`. The plan measures trusted contacts from those events, identified by lower-cased email (the same rule the Talent dashboard uses), and labels the cards "Visits" rather than "Sign-ins".
2. **Account type is not stored on the user.** The roles table holds only the 5 admins; nobody holds two roles today. Account type is resolved by:
   - Admin: has the admin role → excluded.
   - Agency staff: has an `agency_members` row (owner or member). Agency = that agency; test = agency `is_test`.
   - Talent: has a `talent_profiles` row. Agency = the active agency link(s), otherwise "Independent"; test = existing talent test flag.
   - Precedence if someone ever matches more than one: admin > agency staff > talent. The sign-in counts under that single type, so it's never counted twice. (Open question 1.)
3. **"Password + emailed code" isn't what's happening right now.** Two-step sign-in is switched off at the moment, so today a "login" row means a correct password. The count stays honest either way. The definition note will say "completed sign-in", not "password and code".
4. **Data so far:** 138 login rows from 15 people, tracked since 14 Sep 2026.

## Section 7 answers

**First sign-in after accepting an invitation is NOT recorded.** Accepting an agency, talent or admin invitation signs the person in directly and never calls the sign-in log. The first-time 2FA set-up path (`/enroll-2fa`) also skips it. On top of that, today's log is a client call that runs in the background, so a dropped request is lost without anyone knowing.
Proposed fix:
- Record the "login" row on the server, inside the functions that finish a sign-in: password-only success, code verified, 2FA set-up finished, and invitation accepted plus signed in. Add `detail.method` ('password', 'code', 'invite', 'enrol').
- Keep it idempotent per session: at most one row per JWT `session_id`, so a retry or double fire can't inflate counts.
- Earlier invitation first sign-ins can't be rebuilt from the log. As a proxy, the drill-down "First sign-in" column uses the earlier of the first login or the invitation's accepted time, labelled in the helper text.

**Is `talent_audit_log` the right home?** Not long term, because the name misleads. Recommendation: keep the table and all history exactly as they are, and add a read-only view `sign_in_events` over `talent_audit_log WHERE action='login'` (admin-only access). Reporting reads only from the view. A future move to a general `account_audit_log` would then only change the view. No rename now, because renaming is a breaking change for the live app.

## What gets built

### Database (one guarded migration with rollback notes)
- An index on `talent_audit_log (action, created_at)`. `(actor_id, created_at)` already exists twice. Drop the duplicate in a later approved change, not here.
- An index on `loved_one_share_access_events (created_at)`, plus a share-id index if one is missing.
- The view `sign_in_events`.
- Function `report_sign_in_summary(start, end, prior_start, prior_end, scope)`, admin-only and security definer. For each account type it returns: onboarded total, active users, returning users (2+ distinct days), total sign-ins, average days active per active user, and dormant users (no sign-in for 30+ days up to the period end, including never signed in), each for both the period and the prior period. Days are counted in `Africa/Johannesburg` time.
- Function `report_sign_in_rows(start, end, scope, type, agency, sort, dir, limit, offset)` returns one row per onboarded profile via a LEFT JOIN, so zero-activity users appear. Columns: name, account type, agency or Independent, sign-ins, days active, average per week (sign-ins ÷ period weeks, minimum 1), first, last, days since last. It also returns a total count for paging.
- "Onboarded" means: agency staff with an `agency_members` row; talent with a `talent_profiles` row (activated); trusted contacts with a distinct email on at least one share created on or before the period end.

### Test scope (`src/lib/report-scope.ts`)
- Add trusted contacts: test when the sharing talent is test. Agency staff: test when the agency is test (already the rule; reused).
- Real is the default. This is reporting only: no account is changed, deactivated or deleted.
- The SQL functions take the same scope value, so cards and drill-down always agree.

### Server (`src/lib/admin-reporting.functions.ts`)
- `getSignInMetrics` calls the summary function and reuses the period, prior-period and trackingSince helpers. trackingSince = the first login, or the first share-access event for trusted contacts.
- Add `sign_ins_agency`, `sign_ins_talent`, `sign_ins_trusted` to `REPORTING_METRICS`. `getReportingRawRows` delegates them to the rows function with server-side sort, filter and paging. CSV export reuses the existing export path.

### UI (Admin → Reporting)
- A new "Sign-ins and return visits" section using the existing card component. There are three groups: Agency staff, Talent and Trusted contacts. Each group has these cards: Active users (n of total, %), Returning users, Total sign-ins (Visits for trusted contacts), Average days active, and Dormant users. Each card shows the prior-period change the same way existing cards do.
- Helper notes in the existing note style: "Tracking since 14 Sep 2026", "Days are counted in South African time", and how first sign-ins before the fix are estimated. No banners.
- The drill-down opens from each card in the existing drawer. It has sortable columns, an account type and agency filter, export, and paging. Mobile, desktop and dark mode will be checked as an Admin test account.

### Tests
- Account-type precedence, SAST day boundary (23:30 UTC = next day), returning = 2+ distinct days, dormant at 30 days, zero-activity users present, trusted-contact test inheritance, admins excluded, idempotent per-session login.

## Risks
- Counts before the fix under-report first sign-ins, which is why the note and the proxy are needed.
- The 10-minute idle logout inflates raw sign-ins. Days active is the headline measure.
- Trusted contacts are identified by email: one person with two emails counts twice.

## Open questions
1. Is the precedence admin > agency staff > talent acceptable if someone ever holds two account types?
2. Should trusted-contact "Visits" count each code entry, or only visits where a document was actually opened?
3. Dormant: should it include onboarded users who have never signed in? (The plan says yes.) Is 30 days measured to the period end, or to today?
4. For talent linked to more than one agency, should the Agency column list all of them, or the most recent?
