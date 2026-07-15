# Agency Activation Wizard

Replaces the current path where invitees land on generic `/auth`. Introduces a dedicated route at `/agency/activate?token=…` that resolves the invite, locks the email, walks the user through 4 steps, then creates the auth account and lands them in `/agency`.

## Scope — which invitations this applies to

Both types in `agency_invitations`:
- `kind = 'agency_onboarding'` → Agency **Owner** initial activation (created by main-admin from the Admin panel).
- `kind = 'staff'` → Staff invitation (created by an existing agency owner from `/agency/invitations`).

`handle_new_user()` already provisions the agency + owner membership for `agency_onboarding` and the staff membership for `staff` once an auth user exists with the matching email, so the wizard's job is: validate the invite, collect the profile fields, then create the auth account with the exact invited email.

Talent invites (`talent_invitations`) are out of scope for this plan — they'll need their own analogous flow later.

## Assumptions (flag if wrong)

1. `agency_invitations.token` is already generated and included in the invite email link — I'll reuse it. The email link target changes from `/auth?...` to `/agency/activate?token=<token>`.
2. Step 2 fields (with reasoning): **display name** (required, defaults from `contact_person` if present), **phone** (optional). Agency name is fixed from the invite (owner flow) or already tied to the agency (staff flow) — not editable in either case. Role is not editable (server-controlled).
3. Terms & Conditions: a checkbox + link to a `/legal/terms` route (we don't have real T&C content yet — I'll link to a placeholder page unless you supply copy). Acceptance is recorded on the profile as `terms_accepted_at` timestamp (new column) so we have an audit trail.
4. If the invitee is already signed in as a different user when they hit the link, we sign them out first, then show step 1.

## New route

`src/routes/agency.activate.tsx` — public route (not under `_authenticated`), SSR-safe shell.

Layout matches the spec:
- Left: teal full-height panel, TalVault Agency logo/wordmark, headline, description, feature bullet list.
- Right: cream background, white card, 4-segment progress bar, current step body.
- Reuses design tokens from existing `/auth` styling.

### Step 1 — Accept Agency Invite
- Server call resolves the token → returns `{ agency_name, email, kind, contact_person, status, expired }`.
- If invalid/expired/accepted/revoked → show a clear terminal error state (no wizard).
- Shows "You've been invited to activate the workspace for **{agency_name}**."
- Email field: read-only, pre-filled from invite. Info callout below.
- Continue button.

### Step 2 — Your details
- Display name (required, min 2 chars, prefilled from `contact_person`).
- Phone (optional, light format check).
- Continue / Back buttons.

### Step 3 — Create password
- Reuses `src/components/password-input.tsx` (eye toggle) and `src/lib/password.ts` (NIST rules + strength meter) — no new implementation.
- Confirm-password field, must match.
- Continue / Back buttons.

### Step 4 — Terms & Conditions
- Full-width checkbox: "I have read and accept the Terms & Conditions and Privacy Policy." with link.
- **Complete setup** button disabled until checked.
- On submit: calls one server function that (a) re-validates the token, (b) creates the auth user with the exact invited email + chosen password via `supabaseAdmin.auth.admin.createUser({ email_confirm: true })`, (c) sets `terms_accepted_at`, phone, display_name on the row created by `handle_new_user()` (or upserts), (d) signs the user in client-side with the just-set password, (e) redirects to `/agency`.
- If the auth user already exists for that email (edge case: user pre-registered separately), fall back to signing in with the provided password; if that fails, show "An account already exists for this email — sign in instead" with a link to `/auth`.

## Server functions (`src/lib/agency-activation.functions.ts` — new, public, no auth middleware)

1. `resolveAgencyInvitationToken({ token })` — public. Loads invitation by token via `supabaseAdmin` (loaded inside handler). Returns sanitized fields only (`agency_name, email, kind, contact_person, status, expires_at`). Never returns the token or other invitations.
2. `activateAgencyInvitation({ token, email, display_name, phone, password, terms_accepted })` — public.
   - Zod validation (email format, password against NIST rules, terms must be true, phone optional).
   - Reload invite by token; assert `status='pending'`, not expired, and `lower(input.email) === lower(invite.email)` — else specific error codes.
   - `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name } })`.
   - `handle_new_user()` trigger then creates profile + owner/staff membership + marks invite accepted.
   - Follow-up update on `profiles` to set `phone`, `terms_accepted_at = now()`.
   - Returns `{ ok: true, email }` so client can `supabase.auth.signInWithPassword` and navigate.
   - Writes to `admin_audit_log` / `agency_audit_log` as appropriate.

Both use `await import("@/integrations/supabase/client.server")` inside the handler.

## Database migration

- `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;`
- No RLS/policy changes required (profiles already covered).
- No changes to `handle_new_user()` — it already handles both `agency_onboarding` and `staff` kinds correctly.

## Email link update

Wherever we currently compose the invite URL for `agency_invitations` (email preview / send path), swap `/auth?token=…` (or equivalent) for `/agency/activate?token=<token>`. I'll grep and update every call site in the same change — admin owner-invite path and agency staff-invite path.

## Error/edge cases handled

- Missing/invalid/expired/accepted/revoked token → terminal error card with "Contact your administrator" copy.
- Different email attempted → blocked server-side with clear message (email is read-only on the client, but we still validate server-side).
- Auth user already exists for the invited email → offer sign-in path.
- User navigates away mid-wizard → state kept in component only (no persistence); fine because the token is idempotent and can be reopened.
- User already signed in as someone else → force `supabase.auth.signOut()` before rendering step 1.

## Reuse

- Password rules + strength meter: `src/lib/password.ts` + `src/components/password-input.tsx`.
- Card/button/input primitives: existing shadcn components used on `/auth`.
- Toast + form patterns: same as `agency.talent.invite.tsx`.

## Verification

Manual end-to-end with two invites created via existing UIs (one owner, one staff), stepping through the wizard, then confirming:
- New user lands in `/agency` with correct membership row and role.
- Invitation row moves to `status='accepted'` with `accepted_at` set.
- `profiles.terms_accepted_at` and `phone` populated.
- Attempting to reuse the same token afterwards shows the terminal error.

## Deliverables

- New route `src/routes/agency.activate.tsx`.
- New server module `src/lib/agency-activation.functions.ts`.
- One migration adding `profiles.phone` + `profiles.terms_accepted_at`.
- Edits to invite-link composition in `src/lib/admin.functions.ts` and `src/lib/agency.functions.ts` (+ any email preview route referencing the URL).
- Placeholder `/legal/terms` route (thin) unless you'd rather link elsewhere.

---

## Pre-launch checklist (must re-enable before launch)

- [ ] **Mandatory 2FA for admins** — flip `ENFORCE_ADMIN_2FA` back to `true` in `src/routes/admin.tsx`. Currently `false` for dev/testing convenience; a soft dismissible banner recommends enrollment in the meantime.
- [ ] Email auto-confirm — re-enable email confirmation flow before launch.
