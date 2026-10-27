# Two-step sign-in enforcement — deployment note

One switch: the database setting `platform_settings.mfa_enforced` (`true`/`false`, default `false`).
The portal screens, the global server-function gate and the database policies all read it through
`public.mfa_enforced()` / `public.mfa_session_ok()`, so they can never disagree.

## Migrations, in order (all idempotent, safe to re-run on the live database)

1. `supabase/migrations/20261027181000_mfa_switch_and_session_check.sql`
   - inserts `mfa_enforced = false` only if absent;
   - `public.mfa_enforced()`; `public.mfa_session_ok()` (SECURITY DEFINER, STABLE, explicit search_path,
     not executable by anon): true when the switch is off, otherwise only when `mfa_verified_sessions`
     holds a row for `auth.uid()` and the token's `session_id`, verified within 12 hours;
   - audit trigger: every change of the switch is written to `admin_audit_log`
     (`mfa_enforcement_changed`). Writes are limited by the existing admin-editor policy; the service
     role may also change it.
2. `supabase/migrations/20261027181100_mfa_restrictive_policies.sql`
   - RESTRICTIVE policy "Two-step verification required" (`TO authenticated`, USING and WITH CHECK
     `mfa_session_ok()`) on every RLS table in `public` except the code-flow tables (`mfa_codes`,
     `mfa_settings`, `mfa_verified_sessions`) and published reference content (folder catalogues,
     folder type templates, legal documents and legal copy);
   - the same on `storage.objects` for the private buckets `talent-documents`,
     `agency-compliance-docs`, `agency-branding`, `talent-private-documents`, `talent-invite-docs`.

The application code (server gate `src/lib/mfa-gate.ts`, client redirect `src/lib/mfa-redirect.ts`,
session binding in `src/lib/mfa.functions.ts`) must be deployed with or after these migrations.
The service role bypasses RLS, so server code using it keeps working.

## Switching it on (live database only, once email delivery works)

```sql
UPDATE public.platform_settings SET value = 'true'::jsonb WHERE key = 'mfa_enforced';
```

Run as an admin editor in the app's settings or with the service role. Existing sessions must enter a
code on their next action.

## Verifying

- `SELECT value FROM public.platform_settings WHERE key = 'mfa_enforced';` shows the intended value.
- `SELECT * FROM public.admin_audit_log WHERE action = 'mfa_enforcement_changed' ORDER BY created_at DESC;`
- Run `docs/two-step-sql-check.sql`: it switches enforcement on inside a block that always rolls back
  and reports OFF/ON/verified/other-session/no-session results and that non-admins cannot change
  the switch. Nothing is kept.
- In the app: sign in with a password; with enforcement on you are asked for the emailed code before
  any portal page or data loads.

## Rollback

- Fastest, no deploy: set `mfa_enforced` back to `false` (everything behaves as password-only).
- Structural: run the rollback SQL in the header comment of each migration, newest first.
