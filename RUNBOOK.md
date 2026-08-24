# TalVault operational runbook

Honest snapshot of what exists today. Nothing below is aspirational — where a
capability is absent it is stated as absent.

## Ownership split

| Area | Owned by | Notes |
| --- | --- | --- |
| Hosting, TLS, CDN, deploys | Lovable | Cloudflare Worker build from this repo; preview + published environments. |
| Database, auth, storage, cron | Lovable Cloud (managed Supabase) | No direct dashboard access; changes go through migrations in this repo. |
| Application code, migrations, security headers | This repo | Everything under `src/`, `supabase/migrations/`, `public/_headers`. |
| Secrets | Lovable project settings | Runtime secrets only; never committed. |

## Environments

- Preview: `project--<id>-dev.lovable.app` — always the latest preview build.
- Production: `project--<id>.lovable.app` plus custom domain (`talvault.com`, pending).

## Health check

`GET /api/public/health` → `200 {"status":"ok","database":"ok"}`, or `503`
with `"database":"unreachable"`. No auth required; returns no environment data.
Suitable as an uptime-monitor target. No uptime monitor is currently configured.

## Scheduled jobs

- `talent-reminder-scan-daily` (pg_cron) → `POST /api/public/hooks/talent-reminders`.
  Authenticated with the `REMINDER_HOOK_SECRET` env var sent as the
  `x-reminder-secret` header and compared in constant time. Rotating the secret
  requires updating both the project secret and the cron job definition.
- Email queue drain runs from the database queue functions.

## Environment / secrets manifest

Set in Lovable project settings (values never in the repo):

| Name | Purpose |
| --- | --- |
| `REMINDER_HOOK_SECRET` | Authenticates the reminder cron callback. |
| `LOVED_ONE_TICKET_SECRET` | Signs short-lived Loved One browsing tickets. |
| `SEED_AGENCY_OWNER_PASSWORD` | Only needed when running the operator seed helper; absent by default and the helper fails loudly without it. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` | Managed automatically by Lovable Cloud. |

## Security controls in place

- Security headers (CSP, HSTS, frame-ancestors, nosniff, referrer, permissions)
  applied to every Worker response in `src/server.ts`, mirrored for static
  assets in `public/_headers`.
- Server-side upload validation (magic bytes + size) in
  `src/lib/file-validation.server.ts`; failed files are deleted from storage.
  **Gap:** no malware scanning — requires a third-party vendor decision.
- Rate limiting on public invitation, activation and Loved One unlock endpoints
  via `src/lib/rate-limit.server.ts` and `public.consume_rate_limit`.
- Mandatory 2FA on all portals; 10-minute idle sign-out.
- RLS on all user data; admin access to Loved One shares goes through
  `admin_loved_one_shares_view` which excludes tokens and code hashes.

## Backups, monitoring, DR — current real state

- Backups: whatever the managed Supabase plan provides. No repo-owned backup
  job, no tested restore procedure, no documented RPO/RTO.
- Monitoring/alerting: none configured. Errors surface in Lovable logs only.
- Incident process: none formalised.

These are known gaps, not implemented capabilities.

## Common operations

- Apply a schema change: add a migration through the Lovable migration flow;
  never hand-edit the database.
- Rotate `REMINDER_HOOK_SECRET`: set the new secret, then update the cron job's
  header, then confirm the next run returns 200.
- Investigate a failed upload: check server logs for `file_validation_rejected`
  entries; the storage object is removed on rejection by design.
- Suspicious activity on a share link: revoke it from the talent's Sharing
  screen; counters in `public.public_rate_limits` show throttling activity.

## CI

`.github/workflows/ci.yml` runs install, typecheck, lint (non-blocking), tests
and build on push/PR. Lint is non-blocking because the repo has a large
outstanding Prettier formatting diff that has not been applied; treat new
non-formatting lint errors as failures during review.
