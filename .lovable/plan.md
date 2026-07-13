
# Admin Portal — Backend Wiring Plan

## ⚠️ Pre-launch checklist

- [ ] **Re-enable "Confirm email"** in Cloud auth settings. It is currently OFF for dev/testing convenience (auto-confirm ON) — MUST be turned back on before any real launch.


Goal: replace the Admin Portal's in-memory mock data with real, authenticated, role-gated data from Lovable Cloud, while leaving the Agency, Talent, and Loved One portals on their existing mock data for now. Schema will be designed to support all four roles from day one so we don't migrate again later.

No code is changed in this plan step.

---

## 1. Enable Lovable Cloud

- Enable Lovable Cloud (managed Supabase: Postgres + Auth + Storage + server functions).
- Add `_authenticated/route.tsx` (integration-managed gate) and the bearer-attaching middleware in `src/start.ts`.
- Add an `/auth` public route (email/password + Google — Google via the Lovable broker).
- Assumption: email/password + Google is the intended admin sign-in. If SSO/SAML only, flag before build.

## 2. Roles & Access Control

App-wide role model, even though only Admin is functional now:

- Enum `app_role`: `admin`, `agency_owner`, `agency_member`, `talent`, `loved_one`.
- Separate `user_roles` table (never on `profiles`) — required to prevent privilege escalation.
- `has_role(_user_id uuid, _role app_role)` SECURITY DEFINER function used in every RLS policy.
- Admin gate: pathless layout `src/routes/admin` calls a server fn that checks `has_role(auth.uid(), 'admin')`; non-admins get redirected. Same pattern will later gate `/agency`, `/talent`, `/loved-one`.
- Two admin sub-roles handled via a boolean `is_main_admin` on `user_roles` row (for the "Main Administrator" concept already visible in the sidebar) — or a second enum value `main_admin`. Decision to confirm at build time; leaning `is_main_admin` flag to keep enum stable.

## 3. Database Schema (Admin-driving, multi-role-ready)

All tables in `public`, all with explicit `GRANT`s + RLS. Admin policies via `has_role(auth.uid(),'admin')`; per-role policies stubbed but only admin ones exercised now.

Core identity:
- `profiles` (id = auth.users.id, display_name, email, avatar_url, created_at)
- `user_roles` (user_id, role app_role, is_main_admin bool, created_at, unique(user_id, role))

Agencies domain:
- `agencies` (id, name, registration_no, status enum: accepted|invited|incomplete|suspended|declined|cancelled, owner_user_id, joined_at, next_action_note, created_at, updated_at)
- `agency_members` (agency_id, user_id, role: owner|member, created_at) — future-proofs agency portal
- `agency_invitations` (id, agency_id?, email, invited_by, status enum: draft|sent|accepted|expired|declined|cancelled, sent_at, expires_at, accepted_at, token_hash, notes)
- `talent_invitations` (id, agency_id, email, status, sent_at, expires_at) — needed for BR-BELL-004 counts

Documents / reporting (Quotes & Invoices reporting screen):
- `agency_documents` (id, agency_id, type enum: quote|invoice, number, client_name, issued_on, currency, total_cents, status enum, created_at) — admin sees aggregates + read-only rows; agencies later own writes.

Platform ops:
- `admin_audit_log` (id, actor_user_id, action text, target_type, target_id, target_label, metadata jsonb, created_at) — replaces the current session-only audit UI.
- `admin_notifications` (id, tone, title, detail, rule_code, link_path, dismissed_by jsonb or separate `admin_notification_dismissals(user_id, notification_id)`, created_at) — drives the bell.
- `administrators` view = join of `user_roles` where role='admin' + profiles (for `/admin/administrators`).

Enums, grants, RLS policies, and `has_role`-based admin-read/admin-write policies included in one migration. Anon gets no grants on these tables.

## 4. Screens to Rewire

Each currently uses hardcoded arrays; rewire to server functions + TanStack Query (`ensureQueryData` in loader, `useSuspenseQuery` in component).

| Route | Today | After |
|---|---|---|
| `/admin` (index) | Mock KPIs, freshness label ticks off `Date.now()` | KPIs from aggregate server fns over agencies/invitations/documents; freshness from last query time |
| `/admin/agencies` | `agencies` const array, tab counts hardcoded | `list_agencies` server fn + tab counts from `select status, count(*)` |
| `/admin/agencies/$id` | Mock detail | `get_agency(id)` server fn joining members, invitations, doc totals |
| `/admin/invitations` | Local `useState` seed rows | `list_agency_invitations` + `create_invitation` / `resend` / `cancel` server fns; expiry computed server-side |
| `/admin/invitations/new` | Client-only form | `create_invitation` server fn; writes audit log |
| `/admin/quotes-invoices` | 7 hardcoded `Doc` rows, session-only audit | `list_agency_documents` (read-only for admin — BR-QI-002 enforced by RLS: no admin update/insert policy), `log_audit(view/export)` server fn — BR-QI-003 |
| `/admin/audit` | Mock rows | `list_admin_audit(filters)` from `admin_audit_log` |
| `/admin/administrators` | Mock list | `list_administrators` server fn; add/remove admin uses `supabaseAdmin` inside handler with authorization check |
| `AdminShell` bell | Static `initialNotifications` | `list_admin_notifications` + `dismiss_notification` (per-admin dismissal) |
| Sidebar counts (`badge: 9`, `badge: 3`) | Hardcoded | Derived from same queries powering pages |

Placeholders staying visual-only for now (called out so we don't overbuild):
- Global top search input (no backing search yet)
- "Legal / copy review reminder" bell item (no legal-review table — keep as static or drop until spec exists)

## 5. Auth Flow & Middleware

- `src/routes/auth.tsx` — public sign-in (email/password + Google via `lovable.auth.signInWithOAuth`).
- `src/routes/_authenticated/route.tsx` — integration-managed gate, `ssr:false`, redirects to `/auth`.
- Move admin routes under `_authenticated/admin.*` (this is the breaking file move — see §6).
- Admin-only `beforeLoad` in `_authenticated/admin.tsx` calls a `requireSupabaseAuth`-guarded server fn `assertAdmin()` that throws redirect to `/` if `has_role(uid,'admin')` is false.
- `src/start.ts` gets bearer-attaching `functionMiddleware`.
- Root `__root.tsx` adds `onAuthStateChange` subscriber (filtered to SIGNED_IN/OUT/USER_UPDATED) to invalidate router + query cache.

## 6. Risks / Migrations / Breaking Changes

- **Route file relocation**: `src/routes/admin.*.tsx` → `src/routes/_authenticated/admin.*.tsx`. All internal `<Link to="/admin/...">` URLs stay the same (pathless layout), but the file tree changes and `routeTree.gen.ts` regenerates. Low risk, mechanical.
- **`/auth` route is net-new** and public; must be added before the admin gate is enabled or admins get locked out during dev. Plan: land schema + `/auth` + role seeding in one migration/PR, then flip admin routes to gated.
- **First admin seeding**: needs one row in `user_roles` with `role='admin'` for the developer's auth user before the gate goes live. Handled via a one-shot SQL insert after first sign-in, not a public signup path.
- **Other portals (Agency, Talent, Loved One) stay on mock data.** They currently live at top-level `/agency.*`, `/talent.*`, `/loved-one.tsx`. We leave those files untouched. They're not gated yet, so no regression. Schema for their future data (agency_members, talent_invitations, etc.) exists but is unused by their UIs — no breakage.
- **Quotes & Invoices audit UI** currently shows session-only entries; switching to DB-backed `admin_audit_log` changes semantics (persistent, cross-session, potentially larger). We paginate and cap query.
- **Bell notifications** move from static to DB-derived. Dismissals will be persisted per admin — behavior change from current "dismiss = forget until reload".
- **Type generation**: after migration, `src/integrations/supabase/types.ts` regenerates; a few imports may need updating. No app-logic breakage expected.
- **Server-only imports**: any `supabaseAdmin` usage must live in `*.server.ts` or inside `.handler()` bodies with dynamic import, per project rules.

## 7. Suggested Build Sequence (for after approval)

1. Enable Cloud + generate types.
2. Migration: enums, tables, grants, RLS, `has_role`, seed the current dev user as admin.
3. Add `/auth`, `_authenticated` layout, admin gate, start.ts middleware.
4. Move admin routes under `_authenticated/`.
5. Rewire screens page-by-page in order: agencies list → agency detail → invitations → invitations/new → quotes-invoices → audit → administrators → dashboard KPIs → bell.
6. Delete now-unused mock arrays.

## Open questions (please confirm before build)

1. Admin sign-in: email/password + Google, or SSO only?
2. "Main Administrator" vs regular admin — flag on `user_roles`, or a distinct enum value?
3. Should admins be able to CREATE agency documents (quotes/invoices) from the admin side, or strictly read-only per BR-QI-002? (Plan assumes strictly read-only — no admin write policy at all.)
4. Bell "Legal / copy review reminder" — real backing data or leave static?
