
# Agency Portal — Prototype (M0–M7) vs. Current Build

**Scope:** read-only comparison. No code changes proposed here. At the end I list the decisions I need from you before any build phase.

---

## Terminology gap (applies across every screen)

| Prototype term | Current build term | Notes |
|---|---|---|
| Talent Manager / Manager | Agency / Agency Owner / Manager | "Manager" is currently only one of three roles (`owner`, `manager`, `staff`). Spec seems to use "Manager" as the *portal role*, not a sub-role. |
| Talent Roster | Talent (page) / talent list | Naming only; same underlying `agency_talent_links`. |
| Roster Shared Folder | Document Vault / Talent Shared Folder | Same concept — agency-visible docs. |
| Private Vault | (mentioned in copy only; no screen) | We don't yet render the talent-private side because the Talent Portal isn't built. |
| Unfiled Documents | (none) | New concept — inbox for docs uploaded/received but not yet placed in a folder. |
| Document Requests | (none) | New concept — the agency *requests* a doc from talent; talent uploads against the request. Tied to M4. |
| Manager-led documents | (none — status badges apply to everything) | Compliance caveat in M1's footnote. |

**Decision needed:** do we rename portal-wide ("Agency" → "Manager", "Document Vault" → "Roster Shared Folder", etc.) or keep current names and treat prototype names as design-doc variants? This affects sidebar labels, page titles, head meta, subtitles, empty-state copy, toasts, and audit log messages.

---

## M0 — Empty-state onboarding

- **Current:** none. A brand-new agency that just accepted the onboarding invite lands on `/agency` (dashboard) with KPIs showing zeros and the talent table showing a plain "No talent connected yet. Invite talent to get started." row. No two-path CTA, no explainer cards.
- **Prototype requires:** dedicated empty state with two CTAs ("Invite your first talent" / "Set up agency defaults first") + three-step explainer cards.
- **Gap:** entire screen. Simplest wiring is a conditional render in `agency.index.tsx` when `talentCount === 0 && folderTemplates === 0 && billingDocs === 0`.

---

## M1 — Manager Dashboard

**Current** (`src/routes/agency.index.tsx`):
- KPI tiles: Talent Profiles, Vault Documents, Invitations, Quotes & Invoices.
- "Talent Workspace Overview" table with Status/Manager/Type filters + status chip row (7 statuses).
- No warning banner. No "Recent activity" table. No compliance footnote.

**Prototype requires:**
- KPI tiles named: **Total talent, Fully compliant, Needs review, Expiring 30d**. Only "Total talent" maps 1:1 to current. The other three require compliance-computed metrics we don't have.
- Warning banner summarising items needing attention (aggregate of expiring/needs-review across all talent).
- **Recent talent activity** table (chronological event feed) — different shape from the current "one row per talent" overview.
- Footnote clarifying compliance badges only cover **manager-led** documents (talent's Private Vault items excluded from counts).

**Gaps:**
1. KPI set is different — need new derivations (`fully_compliant`, `needs_review_count`, `expiring_30d_count`) and a "manager-led" flag on documents to filter counts (currently no such flag; every doc in `talent_shared_documents` is agency-visible by definition — decision needed on whether the flag is even meaningful pre-Talent-Portal).
2. Warning banner: new component.
3. Recent activity table: needs an event stream. We have `agency_audit_log` but it captures agency admin actions, not talent-facing events (uploads, reviews, resubmissions). Overlaps with M7 — likely one shared event source.
4. Current overview table + status chips + Status/Manager/Type filters are richer than the prototype's spec but aren't what the prototype describes. **Decision needed:** replace with the prototype's activity feed, or keep both (activity feed + collapsible overview)?

---

## M2 — Onboarding modal ("Use standard set" vs "Customise")

- **Current:** no onboarding modal at all. Folder templates are managed on a standalone `/agency/folder-templates` page and applied via a "Play" icon action — no "at first talent invite / at first talent acceptance" moment triggers a modal.
- **Prototype requires:** single-click "Use my standard set" (recommended, shows 6 default folder badges) vs "Customise for this talent", plus a Roster-Shared-Folder-vs-Private-Vault clarifier banner.
- **Gaps:**
  1. Trigger point undefined in current build. **Decision needed:** does this modal fire (a) on first talent acceptance, (b) when the owner clicks "Invite Talent" and no default template exists, or (c) on first login to a fresh agency (M0 flow)?
  2. Requires a seeded 6-folder default. Current default folder list is the informal `FOLDER_OPTIONS` array (`Contracts, ID Documents, Travel, Tax, Other` in vault; `Contracts, ID Documents, Travel, Tax, Certified Documents, Proof of Accounts, Property, Sponsorships, Other` in rules). **Decision needed:** what are the 6 official defaults?
  3. "Customise" path: presumably drops the user into folder-template creation. Need to define whether this creates a *per-talent* template or a reusable one.

---

## M3 — Upload screen with visible-but-blocked destinations

- **Current** (`UploadDialog` inside `agency.document-vault.tsx`): a simple modal with a Folder `<select>` (5 options) and a Talent `<select>`. No allowed/blocked distinction. Private Vault is *not represented at all* — invisible, not "visible but blocked".
- **Prototype requires:** explicit rows for allowed destinations (Contracts, Endorsements, Invoices, ID Documents) AND explicit rows for blocked destinations (Family/Loved Ones, Medical/Insurance, Finance) with lock icons + explanation. Teaching UX, not hiding UX.
- **Gaps:**
  1. Prototype's allowed set differs from ours: it names **Endorsements** and **Invoices** as agency-uploadable folders — we currently treat Endorsements not-at-all and Invoices as a separate billing module, not a doc folder.
  2. We have no data model for "Private Vault folders" (Family/Loved Ones, Medical/Insurance, Finance) at all. There is a `loved_one_shares` table + a `/loved-one` route, but no Private-Vault folder taxonomy. **Decision needed:** do we define these Private Vault folders now (as static labels the upload UI knows to block) or wait for the Talent Portal?
  3. Redesign from `<select>` to a row-based picker with lock icons + tooltips.

---

## M4 — Document review with resubmission workflow

- **Current:** nothing close. `talent_shared_documents` has a `status` column that today can be `filed`, `needs_review`, `ai_suggested` — no `resubmission_required`, no reason codes, no submission history. The vault UI shows the status as a static badge; there is no "Review" action, no accept/reject flow, no notes-to-talent field. There are no "previous submissions" — replacing a file uses the versions table (`talent_shared_document_versions`) but that's for owner-driven re-uploads, not talent-driven resubmissions against a rejection.
- **Prototype requires:** Complete / Resubmission required / Cancel request outcomes, mandatory reason-code dropdown + free-text notes on resubmission, previous-submission history retained (never deleted), presumably a **Document Request** entity that binds an outcome + reason + history together.
- **Gaps:** essentially an entire new feature.
  1. New `document_requests` table (agency → talent request for a specific document with title / folder / due date / status).
  2. Status enum: `open`, `submitted`, `complete`, `resubmission_required`, `cancelled`.
  3. Reason-code enum (needs a client-supplied list — spec doesn't enumerate).
  4. Submission history: extend `talent_shared_document_versions` with a `submission_outcome` + `reason_code` + `reviewer_notes` per version, or create a sibling `document_submissions` table.
  5. UI: a Review action on the doc row → modal with the three outcomes, reason dropdown, notes.
  6. **Blocker:** the "talent resubmits" half of this loop is inert without the Talent Portal. **Decision needed:** build the agency-side review UI now against seeded/manual submissions, or defer M4 until Talent Portal exists?

---

## M5 — Quotes & Invoices

**Current** (`src/routes/agency.quotes-invoices.tsx`):
- KPI tiles: **Outstanding, Paid (90d), Quotes pending, Late** — close but not identical.
- Table columns: Ref, Client, Talent, Type, Status, Amount, Issued, Due.
- Status enum: `draft, sent, accepted, paid, overdue, cancelled`.
- No "Shared with talent" toggle/column.
- No quote→invoice conversion tracking (`agency_billing_docs` has no `converted_from_quote_id` or similar link).
- Tabs: Records / Clients / Settings.

**Prototype requires:**
- KPI tiles: Outstanding, **Paid 30d** (we have 90d), Quotes pending, **Conversion rate** (we have "Late" instead).
- **Shared with talent** column/toggle per document.
- **Quote → Invoice conversion tracking** with cross-reference (a "Convert to invoice" action from a quote; the resulting invoice references the source quote).

**Gaps:**
1. KPI "Late" → "Conversion rate": rename + change computation to `(quotes converted to invoices) / (total sent quotes)`. Requires quote→invoice link.
2. `agency_billing_docs` needs: `shared_with_talent boolean` (default false), `converted_from_id uuid null` (self-ref to quote), and possibly `converted_at`.
3. "Paid (90d)" → "Paid 30d" — trivial constant change; confirm which the client actually wants.
4. UI: add Share toggle in table + editor, add "Convert to invoice" action on quotes, add source-quote badge on invoices.

---

## M6 — Contract detail page with Related Invoices tab

- **Current:** no contract detail page. Contracts are just documents in the vault with `folder = "Contracts"` — no dedicated route, no tabs, no cross-linking to billing docs.
- **Prototype requires:** a full contract detail view with tabs (at minimum "Overview" and "Related invoices"), a summary bar (Invoiced / Paid / Outstanding), and a "Create invoice" button that pre-fills contract context (client, talent, currency).
- **Gaps:** entirely new territory.
  1. New route `agency.talent.$linkId.contracts.$docId.tsx` (or similar) — placement is a design decision.
  2. Relation between a contract (document row) and billing docs (`agency_billing_docs`): today they're unlinked. Options: (a) add `contract_document_id` FK on `agency_billing_docs`, or (b) introduce a `contracts` table separate from documents. **Recommended:** option (a) — minimal, contract *is* the doc.
  3. "Create invoice" pre-fill: needs to know the client, currency, and preferably contract value — currently `talent_shared_documents` doesn't carry a value. **Decision needed:** add `contract_value_cents`, `contract_currency`, `contract_client_name` optional columns to `talent_shared_documents` (only meaningful when folder = Contracts), or introduce a proper `contracts` table?
  4. Summary bar totals: derivable from linked billing docs.

---

## M7 — Activity log

- **Current** (`agency_audit_log` table): captures agency admin actions (invite created/resent/revoked, talent relationship ended/reactivated, doc uploaded, template applied, etc.). Fields: `agency_id, actor_user_id, action, target_type, target_id, metadata jsonb, created_at`. No IP, no device, no city. No dedicated UI to view it — it exists as a table only.
- **Prototype requires:**
  1. A visible route (`/agency/activity` or similar) with a filterable list.
  2. Filter by action type.
  3. Each row shows **device + IP address + city/location** alongside the timestamp.
- **Gaps:**
  1. UI route + component don't exist.
  2. `agency_audit_log` needs new columns: `ip_address inet`, `user_agent text`, `city text`, `country text`. IP + UA are captureable from request headers in server functions; city/country requires geo-IP lookup (typically MaxMind or an equivalent service — needs a client call). **Decision needed:** ship IP + UA now, defer geo lookup, and mark geo as pre-launch? Or add a geo service (extra dependency/cost)?
  3. This overlaps with M1's "Recent talent activity" and M4's submission history — **strong recommendation** to unify: one events table with type filters, exposed as the M7 log AND as a filtered slice on M1.

---

## Summary matrix

| Screen | Exists | Match | Missing |
|---|---|---|---|
| M0 Empty state | No | — | Whole screen |
| M1 Dashboard | Partial | 30% | KPI set, warning banner, activity feed, compliance footnote |
| M2 Onboarding modal | No | — | Whole modal + trigger + default folder set |
| M3 Upload (blocked rows) | Partial | 40% | Row-based UI, blocked destinations, teaching model |
| M4 Doc review | No | — | Whole feature (requests + submissions + reasons + history) |
| M5 Quotes & Invoices | Partial | 70% | Shared-with-talent toggle, conversion tracking + KPI |
| M6 Contract detail | No | — | Whole page + doc↔invoice linkage |
| M7 Activity log | Backend partial | 25% | UI, filter, IP/device/city capture |

---

## Decisions I need before building any of this

1. **Terminology switch** — do we rename portal-wide to Manager / Talent Roster / Roster Shared Folder / Unfiled Documents / Document Requests, or keep current names?
2. **M1 dashboard** — replace current overview table with prototype's activity feed, or keep both?
3. **"Manager-led documents" flag** — meaningful now, or defer until Talent Portal exists (in which case the M1 footnote is copy only)?
4. **M2 trigger point** — where does the onboarding modal fire? What are the 6 official default folders?
5. **M3 Private Vault folder taxonomy** — define now as static labels, or defer to Talent Portal?
6. **M4 build now vs defer** — build the agency-side half against seed data now, or wait for Talent Portal so the loop is testable end-to-end?
7. **M4 reason-code list** — need the enumerated values from the client.
8. **M5 KPI swap** — confirm "Paid 30d" replaces "Paid 90d" and "Conversion rate" replaces "Late".
9. **M6 data model** — extend `talent_shared_documents` with contract fields, or introduce a `contracts` table?
10. **M7 geo-IP** — ship without city/country and mark as pre-launch, or add a geo service now?
11. **Priority / phasing** — build order for M0–M7? My suggested order (cheapest → most valuable last, given Talent Portal isn't built): terminology decision → M0 → M7 (log UI + IP/UA) → M5 (shared + conversion) → M1 (new KPIs + activity feed, reusing M7 events) → M2 (onboarding modal) → M3 (upload redesign) → M6 (contract detail) → M4 (defer until Talent Portal).

Approve/adjust and I'll turn the answered decisions into a build plan phase-by-phase.
