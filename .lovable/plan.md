
# Findings

## 1. Avatar clickability + Agency account page

**Current state (verified in code):**
- Agency shows the initials avatar in **two places**: sidebar footer (`.tvp-avatar` in `agency-shell.tsx:187`) and topbar right (`.tvp-user-dot` at `:258`). **Both are plain `<div>`s** — neither is clickable.
- Admin makes only the **topbar `.tvp-user-dot`** a `<Link to="/admin/my-account">` (`admin-shell.tsx:284`). The footer `.tvp-avatar` in Admin is also a plain div. So "everywhere it appears" for Agency should mean topbar + footer (matching the Admin pattern and going one step further).
- **No Agency account page exists.** `src/routes/agency.my-account.tsx` is absent.
- Admin's `admin.my-account.tsx` (794 lines) is tightly coupled to `admin.functions.ts` (`whoami`, `updateOwnProfile`, `logOwnEmailChangeRequest`, `logOwnPasswordChange`, `logMfaEnrolled`, `logMfaDisabled`) and to Admin-specific fields (`isMainAdmin`, `permissionLevel`, `designation` gated to main admin). **Sharing wholesale would leak Admin semantics into Agency.**
- However, three sub-cards are already portal-agnostic in behavior:
  - `ChangePasswordCard` — only needs `email`, uses `supabase.auth.updateUser` + one audit log call.
  - `TwoFactorCard` — only needs `email` + a `required` flag, uses `supabase.auth.mfa.*` + two audit log calls.
  - `SectionHeader` — pure presentational.

**Design decision (proposed):**
Build a separate `/agency/my-account` route. **Extract the shared cards** into `src/components/account/` so both portals import them, parameterized by portal-specific audit-log server functions passed as props. This avoids duplicating ~400 lines of password/2FA logic while keeping the admin-only Profile/Email cards out of Agency. I'll refactor `admin.my-account.tsx` to import from the shared module in the same pass (no behavior change).

**Agency-specific pieces to build:**
- `agency.my-account.tsx` route with: Profile card (first/last name, plus role display — no designation, since Agency has no equivalent), Email card (same self-service `supabase.auth.updateUser` flow), plus the shared Password + 2FA cards.
- Server fns in `agency.functions.ts`: `updateOwnAgencyProfile`, `logOwnAgencyEmailChangeRequest`, `logOwnAgencyPasswordChange`, `logOwnAgencyMfaEnrolled`, `logOwnAgencyMfaDisabled` — each writes to `agency_audit_log` with existing `logAgencyAction` helper (mirroring admin patterns).

**Wire the avatars:** convert both `.tvp-avatar` (sidebar footer) and `.tvp-user-dot` (topbar) to `<Link to="/agency/my-account">` in `agency-shell.tsx`. Keep hover/focus styles.

---

## 2. Responsiveness — audit findings

**Existing breakpoints in `src/styles.css`:**
- `≤1100px`: plan/finance/rule/doc/two-col grids collapse.
- `≤768px`: sidebar auto-collapses to icon-only; KPI grid → 2 cols; form/meta grids → 1 col.
- `≤720px`: **sidebar `display: none`** — main becomes a block layout.

**Priority issues confirmed by reading the shell + styles:**

**P0 (blocks core use):**
- **Mobile has no navigation.** At ≤720px the sidebar is hidden entirely with no hamburger/drawer replacement. Users on phones cannot navigate the Agency portal at all.
- **Topbar row at narrow widths.** `flex items-center gap-3 justify-end mb-2` contains search input + bell + user-dot; the fixed-width `.tvp-search-top` doesn't shrink and can push the user-dot off-screen at ~375px.

**P1 (visible layout breaks):**
- **Wide data tables** (`agency.invitations.tsx`, `agency.talent.tsx`, `agency.document-vault.tsx`, `agency.quotes-invoices.tsx`, `agency.activity.tsx`) — need audit for `overflow-x: auto` wrappers. If any lack one, columns clip or force horizontal page scroll at ≤1024px.
- **KPI cards on Dashboard** — currently 4 across; at 768–1023px the 4-col rule may still apply, cramping content (recently patched flex issue was a separate bug). Confirm the 4→2 breakpoint kicks in cleanly.
- **Modals** (`UploadDialog` in `agency.document-vault.tsx`, `NewInvitationModal`, folder-picker wizard) — verify they fit 375px viewport (no fixed widths beyond 100vw, form fields stack).

**P2 (polish):**
- Settings tabs bar (`agency.settings.tsx`) — check whether tabs wrap or overflow-scroll at narrow widths.
- Quotes & Invoices filter/toolbar row.
- Activity log filter chips row.

**Deferred / flagged for a bigger pass (not in this plan):**
- Full drawer/off-canvas navigation with focus trap, aria-modal, swipe gesture. This plan ships a simpler "hamburger toggles collapsed→expanded overlay" pattern; a proper drawer is a follow-up.
- Print styles.
- Reduced-motion audit.

---

# Plan — Phase A (do first, ship, verify, then Phase B)

## Phase A — Account page + avatar wiring

1. **Extract shared cards** to `src/components/account/`:
   - `password-card.tsx` — accepts `{ email, logPasswordChange: () => Promise<any> }`.
   - `two-factor-card.tsx` — accepts `{ email, required, logEnrolled, logDisabled }`.
   - `section-header.tsx` — presentational.
2. **Refactor `admin.my-account.tsx`** to import from `src/components/account/` (no behavior change; verifies the extraction).
3. **Add Agency server functions** in `agency.functions.ts` — `updateOwnAgencyProfile`, `logOwnAgencyEmailChangeRequest`, `logOwnAgencyPasswordChange`, `logOwnAgencyMfaEnrolled`, `logOwnAgencyMfaDisabled`. Each guarded by `requireSupabaseAuth` + `agency_members` membership check; writes via existing `logAgencyAction` helper.
4. **Create `src/routes/agency.my-account.tsx`** — head/meta, Profile card (first/last name editable via `updateOwnAgencyProfile`; role shown read-only using `agencyWhoami.role`), Email card (self-service via `supabase.auth.updateUser`), Password card, 2FA card. `required` on 2FA is `me.role === "owner"` (Agency owners must have 2FA; leads/staff optional — flag if you want different).
5. **Wire avatars in `agency-shell.tsx`**: convert `.tvp-avatar` (footer) and `.tvp-user-dot` (topbar) to `<Link to="/agency/my-account">`. Match the sign-out button's hover ring.

**Verify:** navigate to `/agency/my-account`, save profile, change password against seeded user, enroll then disable 2FA. Check `agency_audit_log` rows.

## Phase B — Responsive fixes (prioritized, incremental)

Only P0 + P1 in this pass. P2 flagged for follow-up.

**P0 — mobile navigation + topbar**
1. Add a hamburger button to `agency-shell.tsx` that shows at `≤720px` and toggles a new `.tv-mobile-open` class on `.tv-app`. Under `.tv-mobile-open`, unhide `.tvp-sidebar` as a fixed overlay (position: fixed, full-height, z-index above main, backdrop). Close on nav-item click and on backdrop click. Preserve `Escape` to close.
2. Topbar: make `.tvp-search-top` `min-width: 0; flex: 1 1 200px` so it shrinks; hide the search input entirely at `≤480px` behind a search icon that expands on tap. Keep bell + avatar always visible.

**P1 — tables, KPIs, modals**
3. Wrap each Agency table (`invitations`, `talent`, `document-vault`, `quotes-invoices`, `activity`, `contracts.$id` related invoices) in a `div.tvp-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch }`. Set `min-width` on the `<table>` so columns keep their proportions and the container scrolls horizontally instead of the page.
4. Dashboard KPI grid: audit the `≤1100px` chain — add explicit `.tvp-kpi-grid` rule at `768–1023px` → `repeat(2, minmax(0, 1fr))` (may already be inherited; verify and only add if missing). At `≤480px` → single column.
5. Modals (`UploadDialog`, `NewInvitationModal`, upload wizard): set `max-width: min(720px, 100vw - 24px)` and `max-height: calc(100vh - 32px)` with internal scroll on the body; stack any 2-col form rows to 1 col at `≤560px`.

**Verify:** manual Playwright screenshots at 375, 768, 1280, 1920 for Dashboard, Talent, Invitations, Document Vault, Quotes & Invoices, Activity Log, Settings, and one modal on Document Vault. Report per-viewport before/after and flag any remaining P2 issues for a dedicated pass.

---

# Order of execution

1. Phase A end-to-end, verify, brief report.
2. Then Phase B (P0 → P1), verify per-viewport, report + flag P2.

**Ask before I start:** confirm the 2FA-required rule for Agency (owner-only vs everyone), and whether you want the Admin refactor bundled with Phase A or done as a separate cleanup pass afterward.
