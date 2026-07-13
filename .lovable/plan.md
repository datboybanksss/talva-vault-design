## Design drift findings: `agency-shell.tsx` vs `admin-shell.tsx`

Both files use the same `tvp-*` design tokens and CSS classes, same Lucide icon set, same sidebar/main layout skeleton — so the visual system is already aligned. The drift is behavioural / data-wiring inside the shell:

1. **Hardcoded user identity.** Agency shows `TN` avatar + "Thandi Ndlovu / Agency Owner" as string literals. Admin renders these from the `whoami` server fn (real name, initials, role).
2. **No logout wired.** Agency's `LogOut` button has no `onClick`. Admin calls `supabase.auth.signOut()` + `queryClient.clear()` + `navigate('/auth')`.
3. **Hardcoded notifications array.** Agency has a static `notifications` const with 4 fake items. Admin queries `listNotifications` every 60s, supports dismiss via mutation, filters by tone → icon map.
4. **Static badge counts on nav items.** Agency hardcodes `badge: 24` (Talent) and `badge: 6` (Invitations). Admin has no badges — counts live inside each page. Either drop the badges or derive them from queries.
5. **No auth/role gate on `/agency` route.** `src/routes/agency.tsx` has no `beforeLoad` (compared to `admin.tsx`, which does `getUser()` + `has_role('admin')` redirect). Any signed-in user can currently open the agency portal.
6. Minor: brand sub-label is `AGENCY` (fine) but there's no visual differentiator vs Admin's `ADMIN` — matches pattern, no change needed.

Everything else (colors, cards, tables, chips, KPI tiles, callouts, tabs, buttons) already uses the shared tokens correctly.

## Schema plan — reuse vs add

**Reuse as-is:**
- `agencies` — the tenant row. Already has status/suspension. No changes.
- `agency_members(agency_id, user_id, role, suspended)` — this IS the "how do you become an agency user" table. Set on accept of `agency_invitations`. Roles today are free-text `text`; we'll standardize the allowed values in app code (`'owner' | 'manager' | 'staff'`).
- `agency_invitations` — admin→agency onboarding. Already has `accepted_at`; when accepted it should upsert an `agency_members` row (owner). Verify the `handle_new_user` / accept flow does this; if not, add a trigger or accept-server-fn step.
- `talent_invitations` — agency→talent onboarding. Already exists (13 cols). Needs an `agency_id` column check — likely already there; confirm at build time.
- `agency_documents` — currently only aggregate counters (`shared_folder_count`, `private_vault_count`). Keep as a rollup surface but we need a real per-document table (see below).
- `talent_profiles` — reuse for Talent list joins.
- `agency_billing_docs` — powers the Quotes & Invoices screen. Already covers kind/number/client/issued_at/currency/total/status. Reuse.

**Add (new migrations):**

a. **`agency_talent_links`** — the talent-agency relationship (one talent ↔ one or more agencies, with lifecycle state). Columns:
   - `id`, `agency_id → agencies`, `talent_user_id → auth.users` (nullable until accepted), `talent_profile_id → talent_profiles` (nullable), `talent_invitation_id → talent_invitations`, `manager_user_id → auth.users` (assigned agency staff), `status` enum (`active | invited | expired | read_only | revoked | needs_review`), `talent_type` text (Athlete/Artist/Model — free-text for now), `next_action` text, timestamps.
   - RLS: agency members of `agency_id` can select/update; talent themselves can select their own row.

b. **`agency_documents_items`** (rename in code; table can be `talent_shared_documents`) — real per-document rows powering Document Vault. Columns:
   - `id`, `agency_id`, `talent_link_id`, `name`, `folder`, `status` enum (`ai_suggested | filed | needs_review`), `validity_expires_at` (nullable), `ai_suggested_folder`, `ai_suggested_expiry`, `uploaded_by`, `storage_path` (nullable — files come later), timestamps.
   - RLS: agency members of `agency_id` OR the talent owner.

c. **`agency_folder_templates`** + **`agency_folder_template_items`** — per-agency folder template library backing the Folder Templates screen. Columns on parent: `id`, `agency_id`, `name`, `description`, `is_default`. Items: `template_id`, `folder_name`, `required_docs jsonb`.
   - RLS: agency members of `agency_id`.

d. **`app_role` enum extension (or new `agency_role` enum)** — decide at build time whether to promote existing `agency_members.role` text to an enum `agency_role ∈ {'owner','manager','staff'}` with a check constraint. Non-blocking; can start as text with app-level validation.

e. **Helper security-definer functions:**
   - `is_agency_member(_user_id uuid, _agency_id uuid) returns boolean`
   - `current_user_agency_id() returns uuid` (returns the single agency the caller belongs to; NULL if multi/none — we'll assume one agency per user for v1 to keep RLS simple, and revisit if needed).
   - `has_agency_role(_user_id, _agency_id, _role)` for owner-only actions (invite staff, edit settings).

All new tables ship `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated` + `GRANT ALL TO service_role` in the same migration, RLS enabled, policies scoped via `is_agency_member`, and `updated_at` triggers where relevant.

## Auth / role model

- Someone becomes an agency user in one of two ways:
  1. **Admin invites an agency** (`agency_invitations`, already built). On sign-up via that invite, we insert an `agency_members` row with `role='owner'` for the new `agency_id`. This may already be wired in `handle_new_user` — verify; if missing, add.
  2. **Agency owner/manager invites staff** (new agency-side invitation flow using a table like `agency_staff_invitations`, or reuse `agency_invitations` with a `kind` discriminator — cleaner to add `agency_staff_invitations` to keep semantics distinct). On accept, insert `agency_members` row with the invited role.
- `/agency` route gate: `beforeLoad` does `supabase.auth.getUser()` → check user has at least one row in `agency_members` (not suspended) → set `agency_id` in route context. Otherwise redirect to `/auth`.
- All agency server functions use `requireSupabaseAuth` + a helper `getCallerAgencyId(context)` that reads `agency_members`, throws if none, and scopes every query.
- Admin users are NOT auto-agency users (separation of concerns). If they need to inspect an agency, they use the existing Admin agency-detail screen.

## Build order (5 screens)

Do the shell + auth + one vertical slice first, then broaden — mirrors how Admin was built.

1. **Schema + auth foundation (no UI yet).**
   - Migrations for `agency_talent_links`, `talent_shared_documents`, `agency_folder_templates(+items)`, `agency_staff_invitations`, helper functions, RLS.
   - Backfill/verify `agency_members` insertion on `agency_invitations` accept.
   - `beforeLoad` gate on `src/routes/agency.tsx`.
   - Rewire `agency-shell.tsx`: `whoami` (reused; extend to return agency_id + role), real notifications via a new `listAgencyNotifications` server fn (start with empty list — populated as each feature ships), logout wiring, remove hardcoded badges (or derive from cheap count queries).

2. **Dashboard (`agency.index.tsx`).** KPI tiles from real counts (`agency_talent_links`, `talent_shared_documents`, `agency_staff_invitations` + `talent_invitations`, `agency_billing_docs`). Talent workspace table + status chips from `agency_talent_links` with the existing filters. This is the highest-value screen and exercises most joins — good second step.

3. **Invitations (`agency.invitations.tsx`).** Two tabs: Talent (backed by `talent_invitations`, filter `agency_id = current`) and Staff (new `agency_staff_invitations`). Actions: copy link, resend, revoke. Reuse the token/email plumbing from the Admin agency-invitation flow. Delivers the "invite talent" primary CTA on the dashboard.

4. **Document Vault (`agency.document-vault.tsx`).** Rewire tabs (All / Needs Review / Expiring / Recently Updated) to `talent_shared_documents` queries. AI Filing Suggestions panel filters `status='ai_suggested'` with confirm/edit mutations. Upload defers real file storage — capture metadata rows now, wire Storage bucket in a follow-up.

5. **Folder Templates (`agency.folder-templates.tsx`).** CRUD over `agency_folder_templates(+items)`. Simplest of the remaining screens; independent of talent data.

6. **Quotes & Invoices (`agency.quotes-invoices.tsx`).** Wire to `agency_billing_docs` with `agency_id` scope. Reuse most of the Admin quotes/invoices UI patterns. PDF generation stays out of scope for this pass.

## Out of scope for this pass (call out now)

- Real file uploads to Storage (Document Vault will have metadata rows + placeholder actions; wire a `talent-docs` bucket in a follow-up).
- Sending real invitation emails from `talvault.com` — depends on the Lovable Emails domain verification still in flight. Invitation records + tokenized accept links land now; email delivery hooks in once the domain is verified.
- Multi-agency membership per user (v1 assumes one).
- Talent-side portal changes (separate track).

## Questions before I start building

1. **One agency per user, correct?** Simplifies RLS + `current_user_agency_id()`. Confirm.
2. **Agency staff invitations** — new `agency_staff_invitations` table (cleaner) vs reusing `agency_invitations` with a discriminator (fewer tables)? I'd default to the new table.
3. **Nav badge counts** on the sidebar (Talent: 24, Invitations: 6) — drop them, or derive from real counts? Admin doesn't have them; I'd drop for consistency.
4. **The static "Reminders" bell content** on Agency — start with an empty state and populate per feature (like Admin did), or design a fixed set of agency reminder rules up front?
