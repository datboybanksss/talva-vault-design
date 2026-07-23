# Talent Portal — Full Build Plan

## 1. Current state (builds on the button audit)

**Routes on disk** (`src/routes/talent.*.tsx`): `talent.tsx` (shell), `talent.index.tsx` (dashboard), `talent.vault.tsx` (Roster Shared + Private tabs), `talent.sharing.tsx`, `talent.budget.tsx`, `talent.settings.tsx`. None are gated by `_authenticated/`. All content is hardcoded mock arrays; forms are uncontrolled; buttons are inert (per the audit).

**What already exists on the backend that Talent will plug into** (verified in DB):
- `talent_invitations` — invite token + folder selection (standard/custom)
- `talent_profiles` — linked to `auth.users` via `user_id`
- `agency_talent_links` — the agency⇄talent relationship, `status` includes `invited/active/ended`
- `agency_talent_folders` — folders provisioned per talent link (M2)
- `talent_shared_documents` + `talent_shared_document_versions` — Roster Shared Folder documents, retention-locked. RLS already includes **"Agency or talent read shared docs"** (SELECT allows the linked talent).
- `agency_document_requests` — requests from agency. RLS is agency-only today; no talent SELECT/UPDATE policies.
- `loved_one_shares` — placeholder table (talent_id, email, is_active). Admin-only RLS today; no talent policies, no per-folder scoping.
- `handle_new_user` trigger already calls `accept_talent_invitation()` on signup, which creates the profile, link, and provisions folders. **The plumbing to become a talent on signup is done.**

**Storage**: `talent-documents` bucket exists (private) and is used by the agency side.

## 2. Auth model

Signup path already works via the trigger. What's missing is the **UI** wrapping it:

- **Public**: `/invite/$token` currently handles the agency-onboarding invite. Extend (or split into `invite.agency.$token` / `invite.talent.$token`) so a talent token shows a talent-specific landing: invited-by agency, folders that will be provisioned, T&Cs, then "Accept & create account" → `/auth?mode=signup&next=/talent`.
- **`/auth`** already routes by path (`/talent` → talent workspace). After sign-in the trigger has run, so first landing on `/talent` finds a `talent_profiles` + `agency_talent_links` row.
- **Route gating**: move all `talent.*.tsx` under `src/routes/_authenticated/talent.*.tsx` so the integration-managed gate covers them. Add a `beforeLoad`/loader that fetches `talent_profiles` for `auth.uid()` and 404s / shows an "ask your agency for an invite" screen if none.
- **Talent Activation Wizard**: recommend a lightweight one — not the heavy Agency wizard. Two short steps post-signup: (a) confirm display name / contact number → writes to `talent_profiles` and (optionally) sets password, (b) tour of Roster Shared vs Private Vault. Skippable. Flag: **should this wizard also collect ID number / date of birth for SARS-relevant Tax folder metadata? Assumption: no — Private Vault content is user-managed, not structured fields.**

## 3. Real functionality scope

- **Roster Shared Folder (read-only)**: list `talent_shared_documents` for the talent's `agency_talent_links.id`, grouped by `folder`, with retention/lock badges, version download via signed URL from `talent-documents` bucket. Read-only — no upload, no delete. Filters: folder, status, expiry.
- **Private Vault (fully talent-owned)**: real upload/organize/delete of personal docs the agency **cannot** see. New schema (§4). Folder taxonomy = the six categories we already designed in the UI (Personal, Dependents, Health, Insurance, Tax, Pets) with the grouped subfolders. Uploads go to a private bucket keyed by `talent_user_id`.
- **Document Requests (talent side)**: list pending `agency_document_requests` for the talent's link; "Fulfil" opens upload → writes a `talent_shared_documents` row into the requested folder + updates `agency_document_requests.current_document_id` and status to `submitted`. Requires new talent-side RLS policies (§4).
- **Loved-One Sharing**: real invite/revoke of an email address, scoped **per Private Vault folder** (not all-or-nothing). Loved-one view is the existing `/loved-one` route reading via a share token or signed session. Flag: **need decision — magic-link email view vs full auth account for loved ones. Assumption: magic-link token per share (simplest, matches current `loved_one_shares` shape).**
- **Budget & Income**: **recommend deferring**. It's a large standalone feature (transactions, categories, goals) that doesn't depend on the agency backend and won't block Talent going live. Keep the current mock page behind a "Coming soon" state or hide from nav until scoped separately.
- **Settings**: wire display name / contact / password change / 2FA (mirror admin `/enroll-2fa`) / notification prefs. Sign-out.

## 4. Schema gaps

New / changed migrations needed:

**Private Vault**
- `talent_private_folders(id, talent_user_id, name, parent_id nullable, sort_order, created_at, updated_at)` — talent owns rows; unique (talent_user_id, parent_id, name).
- `talent_private_documents(id, talent_user_id, folder_id, name, storage_path, mime, size_bytes, created_at, updated_at)` — RLS: `talent_user_id = auth.uid()`.
- Storage bucket `talent-private` (private). RLS on `storage.objects` scoped to `auth.uid()::text = (storage.foldername(name))[1]`.
- Seed the six-category taxonomy on first login via a server fn (idempotent), not a trigger, so we can evolve it.

**Document Requests (talent side)**
- Add SELECT policy: talent can read requests where `talent_link_id.talent_user_id = auth.uid()`.
- Add UPDATE policy: talent can set `current_document_id` + status → `submitted` on their own requests (agency retains review authority).

**Loved-One Sharing**
- Extend `loved_one_shares`: add `folder_scope text[]` (Private Vault folder names or ids), `token` (opaque), `expires_at`, `revoked_at`, `created_by`.
- Add talent RLS: talent can CRUD their own rows (`talent_id.user_id = auth.uid()`).
- Loved-one read path via server fn that validates token → returns folder-scoped file list + signed URLs.

**Nothing to change** on `talent_shared_documents` — read policy already covers linked talents.

## 5. Build order

Phased like Agency:

1. **Foundation** — move `talent.*` under `_authenticated/`, add talent-link loader/gate, split invite landing for talent tokens, wire real logout + settings identity fields. (Unblocks everything.)
2. **Roster Shared Folder (read-only)** — real list, grouping, signed-URL download, filters. Uses existing schema.
3. **Private Vault schema + bucket** — migration for `talent_private_folders`, `talent_private_documents`, storage policies, seed helper.
4. **Private Vault UI** — replace mock folder cards with real CRUD (create/rename/delete folders and subfolders, upload/delete files, keep the Tax subgroup UI we just built).
5. **Document Requests (talent side)** — new RLS policies, requests inbox on dashboard + vault, fulfil-via-upload flow.
6. **Dashboard KPIs + activity** — real counts (shared docs, pending requests, expiring soon), recent activity from `talent_shared_documents` + requests.
7. **Loved-One Sharing** — schema extension, invite/revoke UI, per-folder scope, `/loved-one` token view.
8. **Talent Activation Wizard** (lightweight) — post-first-login two-step nudge.
9. **Polish** — notifications bell (dismissible, mirroring admin), search wiring, empty states.
10. **Budget & Income** — deferred; explicit "coming soon" until separately scoped.

## Ambiguities to confirm before build

- **Talent Activation Wizard depth**: lightweight 2-step as proposed, or richer (ID number, DOB, address, banking for SARS tax records)?
- **Loved-One access**: magic-link token view (assumed) vs full account signup?
- **Private Vault folder editability**: are the six top-level categories fixed (talent can only add subfolders) or fully user-editable? Assumption: **fixed top-level, subfolders editable** — matches the "recommended" pattern we designed.
- **Budget & Income**: confirm deferral, or should it stay in scope as mock-with-persistence?
- **Invite token route split**: OK to introduce `invite.talent.$token.tsx` alongside `invite.$token.tsx`, or extend the single route?
