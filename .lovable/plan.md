# Single sign-in page + emailed one-time codes

## What changes for people using TalVault

- The "Choose your portal" landing page goes away. Visiting talvault.com shows one
  sign-in page: email and password, with "Forgot password?" underneath.
- After signing in, TalVault works out from their account which workspace they belong
  to (admin, talent manager, talent, loved one) and takes them straight there. Nobody
  picks a portal, and anyone who lands on the wrong address is quietly moved to theirs.
- Everyone signs in with a second step: a 6-digit code sent to them. First time only,
  they see a short plain-language explainer about what this is and why we do it.
  After that they just get asked for the code.

## Two things to decide

1. **Forgot password** — it already exists at /forgot-password with a working reset
   page. Plan is to link it from the new sign-in page rather than build anything new.
2. **SMS codes** — TalVault can send email today, but there is no text-message
   service connected. To offer SMS we need an account with a provider (Twilio is the
   usual choice) and its credentials added in Project Settings → Secrets. Plan below
   builds email codes now and leaves the SMS option switched off but ready, so it
   appears the moment the credentials exist. Phone numbers are already stored on
   profiles, so the "add a mobile number" part is small.

   Note: outbound email is still blocked by the unverified notify.talvault.com domain.
   Sign-in codes will only reach inboxes once that DNS verification completes — same
   blocker as invitations. Everything else works regardless.

## Technical plan

### Role → destination
Replace `src/routes/index.tsx` with the sign-in page (reuse the existing `tv-auth`
split-panel markup from `src/routes/auth.tsx`, generic hero copy, no portal picker).
`resolvePortalHome()` in `src/lib/portal-access.ts` already resolves a destination from
real records (`has_role`, `agency_members`, `talent_profiles`); extend it with the
loved-one case and reuse it everywhere. Portal gates keep `checkPortalAccess`, but on a
settled denial they redirect to the account's real home when one exists, and only fall
back to the sign-in page with an explanation when the account has no workspace at all.
`/auth` stays as a route (deep links, invitations) and redirects to `/`.

### One-time codes (new, replaces TOTP)
Migration adds:
- `public.mfa_settings` — user_id, preferred_channel (`email`|`sms`), phone_verified_at,
  enrolled_at, explainer_seen_at. RLS: own row only; GRANTs for authenticated +
  service_role.
- `public.mfa_codes` — user_id, channel, code_hash (sha256, never plaintext),
  expires_at (10 min), consumed_at, attempt_count, created_at. No client access; server
  functions only via service role.

Server functions in `src/lib/mfa.functions.ts` (bearer-authenticated, so a code can only
be requested for the signed-in account):
- `requestSignInCode` — rate limited through existing `consume_rate_limit`
  (per user: 5 sends / 15 min; per IP: 20 / 15 min), invalidates prior unused codes,
  sends via the Lovable email queue using a new `buildSignInCodeEmail` in
  `src/lib/brand-email.ts` house style.
- `verifySignInCode` — single use, constant-time compare, max 5 attempts per code,
  marks consumed, stamps `enrolled_at`, writes an audit row.
- `setMfaChannel` / `startPhoneVerification` / `confirmPhoneVerification` — the SMS
  path; the channel picker only offers SMS when a provider is configured and a
  verified number is on file.

Because this is our own code rather than Supabase TOTP, the session is marked verified
with a short-lived server-issued marker checked by `checkMfaGate()`, so gates behave as
they do today. `MFA_ENFORCED` returns to `true`; existing TOTP factors are ignored and
unenrolled on next sign-in.

### Enrolment explainer
`src/routes/enroll-2fa.tsx` is rewritten as the plain-language explainer plus channel
choice, shown only when `mfa_settings.explainer_seen_at` is null. Subsequent sign-ins go
straight to a code-entry step on the sign-in page (resend link with a countdown, no
inline warning banners — errors use the existing notification/toast pattern).

### Housekeeping
UK/SA spelling, `tvp-*` tokens and shared `Input`/`Button` components throughout, no
hardcoded roles or counts. Verified with `bunx tsgo --noEmit` and a Playwright run of
sign-in → code → landing for an agency account.
