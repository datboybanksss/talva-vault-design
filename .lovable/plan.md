# Pre-launch copy & readiness audit — findings only

No changes made. Findings below, grouped by severity, each with file path, exact string, and a suggested replacement in TalVault voice.

## P0 — launch blockers

### 1. Dead mock screen wired into the live sidebar
`src/routes/agency.talent.tsx` — the entire Talent Roster page is a hardcoded array. Real customers reach it from the Agency sidebar ("Talent") and from five links on the Agency dashboard.
- `{ name: "Caster Semenya", sub: "Athlete · Connected 12 May 2026", ... }` and three sibling rows (`Lara Maseko`, `Neo Khumalo`, `Maya Daniels`).
- Tab counts are literals: `{ label: "All", count: 24 }`, `Active 18`, `Invited 6`, `Expired 2`, `Read-only 3`, `Revoked 1`.
- Lead filter hardcodes staff: `<option>Thandi Ndlovu</option><option>Sipho Dlamini</option>`.
- Search box and all three selects are inert.
- Suggested: replace with a live query of the agency roster; empty state "No talent on your roster yet — invite your first talent to get started."

### 2. Non-functional invite wizard behind a primary CTA
`src/routes/agency.talent.invite.tsx` — reached via the dashboard's primary "Invite Talent" button. Step 4 shows fixed fake data and "Send Invitation" does nothing.
- `<strong>Caster Semenya</strong>`, `<strong>caster@example.com</strong>`, `<strong>Thandi Ndlovu</strong>`
- `<option>Thandi Ndlovu (Owner)</option><option>Sipho Dlamini</option><option>Aaliyah Mokoena</option>`
- `placeholder="e.g. Caster Semenya"`
- Suggested: point the CTA at the working invitation flow, or bind this wizard to real form state and the live send server function; review panel should echo the values entered.

### 3. Admin 2FA enforcement is switched off
`src/routes/admin.tsx:11` — `const ENFORCE_ADMIN_2FA = false;` with the comment "⚠️ PRE-LAUNCH CHECKLIST — MUST FLIP BACK TO `true` BEFORE LAUNCH… This is a testing-convenience toggle only."
- Suggested: set to `true` and delete the toggle so admin 2FA is unconditional.

### 4. The reported string
`src/routes/admin.index.tsx:136` — `Excludes deleted / test records`
- Suggested: `Talent currently active across all agencies`

## P1 — internal/dev language visible to users

| File | Exact string | Suggested replacement |
| --- | --- | --- |
| `src/routes/index.tsx:87` | `Portal selector · Demo` | `Choose your portal` |
| `src/routes/index.tsx:139` | `UI demo · mock data · no live accounts` | Remove the line entirely |
| `src/components/agency/vault-requests-panel.tsx:114` | `The Talent Portal isn't live yet — requests are seed-data-ready and will hook into talent submissions once it ships.` | `Talent see your request in their portal and upload directly to it.` |
| `src/components/agency/folder-templates-panel.tsx:137` | `Reusable folder sets that seed retention rules when applied.` | `Reusable folder sets that apply your retention rules automatically.` |
| `src/routes/admin.audit.tsx:278` | `Event ID: {selected.id}` | Keep, but label it `Reference` — a raw UUID labelled "Event ID" reads as internal plumbing |

## P2 — unfinished states a customer would notice

- `src/routes/talent.budget.tsx:66-68` — `Coming soon` badge plus `Budget & Income is not available yet`. Honest, but it is a full sidebar entry leading to a dead page. Suggested: hide the nav item until it ships, or soften to `Budget & Income — arriving soon. Your Vault and sharing work as normal today.`
- `src/components/agency/vault-requests-panel.tsx` — request flow depends on the talent side being live; verify end-to-end before launch.
- `src/lib/ai-filing.functions.ts:6` — code comment only, not user-visible: "No AI is involved yet — the UI seeds its 'suggestion' from the folder…". Worth confirming the AI Review modal's confidence/provenance wording is not overclaiming to users.

## P3 — voice and locale

- `src/lib/talent-vault-defaults.ts:24` — `Driver's License` → `Driver's Licence` (SA/British English). Same file line 58: `Vehicle License Disk` → `Vehicle Licence Disc`.
- `src/routes/agency.talent.tsx` mixes Title Case status labels (`Needs Review`, `Read-only`) with sentence case elsewhere; standardise on sentence case.
- Placeholder emails are fine in context but sample names should stay generic: `agency.invitations.tsx:448,453` use `e.g. Lara Maseko` / `e.g. Sipho Dlamini`; `talent.sharing.tsx:385` uses `sarah@example.com`. Suggested: `e.g. full name as it appears on ID` and `name@email.com`.

## Clean — checked and clear

- No `TODO`, `FIXME`, `lorem ipsum`, `dummy`, `staging`, or `debug` strings in user-visible copy.
- No environment names, feature-flag states, or `console.log` fallbacks rendered in UI.
- No test/QA email identities (`test.manager@…`, `Sample Agency`) anywhere in the app.
- Lovable references are confined to auto-generated integration files and error reporting, none user-visible.

## Suggested fix order, once approved

1. Flip `ENFORCE_ADMIN_2FA` and remove the toggle.
2. Fix the admin subhead and the two landing-page demo strings.
3. Replace the mock Talent Roster and invite wizard with live data (largest item).
4. Copy sweep for P1 table, P3 locale and casing.
5. Decide on the Budget nav item.
