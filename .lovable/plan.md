## Batch 1 — Admin portal audit vs canonical TalVault design system

Reference baseline (from the tightened Agency portal, Q&I in particular):
- **KPI cards**: circular icon badge (46px) left, big number (26px), label (13px/900), plus a **colored action-hint line** (green/amber/red/muted) below (e.g. "Ready to convert", "Needs follow-up").
- **Chip row**: 6-up `tvp-life-chip` with count + label, `tvp-bg-{tone}`, click-to-filter with `tvp-active-filter`.
- **Workspace toolbar**: search + Status + Talent/entity + Type + Sort selects, plus a **"Reset filters" link that only appears when a filter is active**.
- **Table**: `tvp-status` pills, `tvp-mini-btn` actions, and a **subtitle line under the primary reference cell** (e.g. description below number).
- **Directional color use**: teal = default/share/Agency→Talent, amber = request / attention, red = late/blocked, green = complete/paid, purple = invoice/admin, blue = info/sent.
- **Spacing rhythm**: `.tvp-settings-tight` and `.tvp-account-grid` patterns — card padding 16–18px, gap 12px, section-head margin 12px.

Admin routes audited: `admin.index.tsx`, `admin.agencies.index.tsx`, `admin.invitations.index.tsx`, `admin.administrators.tsx`, `admin.audit.tsx`, `admin.my-account.tsx`, `admin.tsx` (2FA banner), `auth.tsx`. There is **no Admin Document Vault route** — that surface only exists on Agency. Flagging as "N/A" below; confirm if you expected one.

---

### 1. Admin Dashboard (`admin.index.tsx`) — mostly aligned, a few gaps

Matches:
- 4 + 2 KPI cards use `tvp-kpi` shell, icon badges, big-number pattern.
- Chip row (`tvp-life-chips`) with count/label already present under "Agency Onboarding Overview".

Drift:
- **KPI hint line is single-tone.** Only "Suspended Agencies" and "Open Agency Invites" use `tvp-warn`/`tvp-info`. Q&I now uses a **dynamic tone** (green when there's work to do, muted when zero — e.g. "Nothing in progress"). Admin's tiles show static phrasing regardless of value.
- **No filter-reset UX.** Chip-row filter has no "Reset filters" affordance; instead there's a "Showing all agencies / Filtered by X" text line at 12px — inconsistent with the Q&I pattern.
- **Table missing subtitle line.** Agency cell just shows `<strong>{name}</strong>`; canonical pattern would add a muted subtitle (e.g. contact email or country). Contact/country are in separate columns instead.
- **KPI grid is split into two rows of 4 + 2 via two separate `tvp-kpi-grid` wrappers.** Q&I uses a single 4-up row. Not wrong, but visually less rhythmic; flag for decision.

---

### 2. Agencies list (`admin.agencies.index.tsx`) — moderate drift

Matches: `tvp-topbar`, `tvp-card`, `tvp-toolbar`, `tvp-table`, `tvp-status` pills, `tvp-mini-btn` actions.

Drift:
- **Uses `tvp-tabs` for status filtering** (All / Active / Invited / Suspended…) instead of the canonical **chip row with counts**. Q&I moved away from tabs to `tvp-life-chip`. Counts are shown inline in the tab (`<span tvp-status>`), which is a different visual than the chip.
- **No KPI cards at all** — jumps straight from topbar to tabs. Agencies list is arguably the Admin equivalent of Talent Roster, which does have KPI-style stats above the list; a chip-summary would help.
- **Toolbar has only a search field**, no Status/Country/Sort selects. Q&I toolbar is denser (search + multiple selects + Reset link).
- **Table `Agency` cell has a subtitle** (`<span tvp-muted>{contact_email}</span>`) — this already matches the canonical subtitle pattern. Good.
- **No "Reset filters" affordance.**

---

### 3. Invitations (`admin.invitations.index.tsx`) — same tab-vs-chip drift

Matches: topbar, card, table, status pills, mini-btn action cluster.

Drift:
- **`tvp-tabs` with inline count pill** instead of `tvp-life-chip` row. Same pattern as Agencies list.
- **No KPI cards.** Q&I has 4 KPIs above the workspace; Invitations dashboard-value data (pending, expiring, accepted, cancelled) is currently only encoded in the tab count.
- **Expiry column uses `tvp-status` with tone** — good, already directional.
- **No search / talent / sort selects** in toolbar (there is no toolbar at all — table is flush against the tabs).
- **Recipient cell subtitle** already uses the muted contact_person line — matches pattern.

---

### 4. Administrators (`admin.administrators.tsx`) — closest to canonical, minor gaps

Matches:
- **Has KPI cards** (Total Administrators / Main Administrators) in the `tvp-kpi-grid` shell with icon badges — correct pattern.
- Table uses `tvp-status` pills for role and permission level with correct tones (purple/blue for role, green/amber for permission).
- Invite panel uses `tvp-card` and `tvp-primary` button.

Drift:
- **KPI cards have no hint/action line at all.** They stop at the label. Canonical Q&I always has a third line ("Continue editing", "All on schedule", muted "Nothing pending"). Admins tiles should show e.g. "1 pending invitation", "All main admins active".
- Only 2 KPI cards; grid renders them at half-width. Consider adding "Pending Invitations" + "2FA Enrolled" (or similar real metric) to fill a 4-up row.
- **No chip row and no search / filter toolbar** on the Administrators table.
- Invitations sub-table below has its own toolbar but no chip-row treatment for invitation status.

---

### 5. Audit Log (`admin.audit.tsx`) — moderate drift

Matches: topbar, card, table with `tvp-status` pills for area/severity, split-panel Event Details on the right.

Drift:
- **No KPI cards** for at-a-glance metrics (Events today / Critical this week / Failed sign-ins / Suspicious IPs) — Agency's `agency.activity.tsx` also skips this, but the canonical spec now says every top-level surface should lead with KPIs.
- **No chip row** for action-type filtering (there are `tvp-select` dropdowns in the toolbar instead). Canonical M7 spec and the tightened Q&I use `tvp-life-chip` counts by category. Agency Activity uses chip filters — Admin doesn't.
- **Date-range selector**: confirm parity with Agency Activity, which has a proper `tvp-topbar` date range control.
- **Event Details right panel** — spacing is looser than the tightened `.tvp-account-grid` rhythm; padding inside is not using the tightened wrapper.
- **No "Reset filters"** link.

---

### 6. My Account (`admin.my-account.tsx`) — spacing drift

Matches: uses `tvp-account-grid` + shared account components (same shell as Agency My Account).

Drift:
- **Does NOT use `.tvp-settings-tight` wrapper.** The Agency My Account got a spacing tightening pass (`padding: 16px 18px`, `gap: 12px`). Admin still renders with looser default `tvp-card` padding.
- Uses the shared `SectionHeader` — the flex-start fix we shipped for Agency 2FA overlap applies globally, so Admin inherits that fix. Good.
- Otherwise structurally identical to Agency My Account, so tightening is a one-line class add + verify.

---

### 7. Auth / Sign-in page (`auth.tsx`) — separate design language

Uses a **completely different token family**: `tv-auth-*` classes (hero panel, brand mark, form, submit button, divider, alerts) rather than `tvp-*`.

Drift vs canonical:
- **`tv-auth-submit`** button ≠ `tvp-primary`. Same for `tv-auth-google`, `tv-auth-link`.
- **Alert style** (`tv-auth-alert`) is separate from `tv-form-alert` used in My Account.
- **Hero panel** uses its own gradient/mark styling that doesn't reference `--tvp-teal` / `--tvp-amber` tokens directly (needs verification — may already token-map, but styles live under a parallel namespace).
- **Field styling** (`tv-auth-field`, `tv-auth-hint`) is a separate typography scale from the tightened forms in Settings subtabs.

Decision needed: (a) leave Auth on its own hero-panel language as an intentional "outside the app shell" surface, or (b) fold Auth into `tvp-*` tokens (colors + button + alerts) while keeping the split-hero layout. My recommendation: **(a) — keep the hero language, but audit that its colors/typography reference the same CSS variables** (teal/amber/ink) so brand rhythm carries across. Confirm your call.

---

### 8. Admin shell 2FA banner (`admin.tsx`) — minor

The 2FA-required banner uses inline `background`/`color` styles with `var(--tvp-amber-bg, #fef3c7)` fallbacks. Elsewhere we've moved off inline hex fallbacks entirely (the tokens are always defined). Small cleanup; not a visual issue.

---

## Summary of consistent themes to fix across Admin

1. **Add colored action-hint line to every KPI card** (dynamic tone based on value).
2. **Replace `tvp-tabs`-with-count-pill pattern with `tvp-life-chip` row** on Agencies list, Invitations, and (proposed) Audit action-type filter.
3. **Add KPI card rows to Agencies list, Invitations, and Audit** — leading metrics before the table.
4. **Add "Reset filters" link + fuller filter toolbar** (search + selects) on Agencies, Invitations, Audit — matching Q&I.
5. **Apply `.tvp-settings-tight` (or equivalent) to Admin My Account** and Audit's right-panel spacing.
6. **Decide Auth page scope** — hero stays, or fold tokens into `tvp-*` family?
7. Clean up inline hex color fallbacks in `admin.tsx` shell banner.

## Not in this batch — flag for later

- **No Admin Document Vault route exists.** If canonical spec now expects an admin-visible aggregate vault surface, that's a new build, not a redesign.
- Admin quotes-invoices (`admin.quotes-invoices.tsx`) not audited in this batch — was that intentional (Admin doesn't need Q&I) or a miss? Confirm before Batch 2.
- `admin.enroll-2fa`, `admin.invitations.new`, `admin.invitations.$id.email-preview`, `admin.agencies.$id` (detail page) — deferred to Batch 2 (secondary/detail surfaces).

## Question before I build

- Confirm the **KPI-row addition on Agencies/Invitations/Audit** is in scope — that's the biggest visual change and adds surface area, not just polish.
- Confirm **tabs → chips migration** is approved (it changes the interaction shape, not just tokens).
- Confirm **Auth page scope** (a) keep hero language, or (b) full `tvp-*` fold-in.
- Confirm **Admin Q&I** should be included in Batch 2.
