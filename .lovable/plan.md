
# Agency Portal — Prototype (M0–M7) vs. Current Build

Read-only comparison. No code changes proposed. Tight per-screen summary + terminology recommendation at the end.

---

## Legend
- **Match** — implemented and equivalent
- **Partial** — implemented but with notable differences
- **Missing** — not built

---

## M0 · First login empty state

**Verdict: Missing (entire screen)**

- No dedicated empty state today. A fresh agency lands on `/agency` with zero-value KPIs and a "No talent connected yet" table row.
- No two-CTA card, no 3-step explainer, no distinct "Home" landing.

**Key mismatches**
- Sidebar item set differs — see terminology section.
- Prototype has a personalised "Welcome, John" header we don't render.

---

## M1 · Manager dashboard

**Verdict: Partial (~30%)**

**Matches**
- KPI grid exists (4 tiles).
- Talent table exists with filter chips.

**Key mismatches**
- KPI tiles are the wrong four. Ours: *Talent Profiles / Vault Documents / Invitations / Quotes & Invoices*. Prototype: *Total talent / Fully compliant / Needs review / Expiring 30d*, each with a delta line. Three of the four require compliance metrics we don't compute.
- **No warning banner** ("N items need your attention" with counts + Review-now CTA).
- The table is a per-talent overview, **not** a chronological "Recent talent activity" feed. Filter chips differ too (ours: 7 statuses; prototype: All / Needs review / Action needed / Compliant).
- No "Pending / Last activity / Open" columns; no delta metadata under tile values.
- No footnote about manager-led scope (BR-DOC-013).
- No topbar meta line (agency name · N active talent · storage used) or notification-bell dot indicator styled as spec.

**Big-gap flag** — this is closer to a redesign than a wire-up. The activity feed also overlaps M7 (shared event source).

---

## M2 · Onboard talent modal

**Verdict: Missing**

- We have no post-invite folder-selection modal at all. Folder templates live on a separate settings page and are applied manually with a Play button. There is no "at this moment, pick a folder set for this talent" flow tied to the invite action.

**Key mismatches**
- No two-radio "standard set vs customise" pattern.
- No 6-folder default badges. Our informal folder lists vary between vault (5) and rules (9) — no canonical "6 default folders" (prototype: ID, Contracts, Invoices, Tax, Endorsements, Legal).
- No "Roster Shared Folder vs Private Vault" clarifier banner.
- No deep-link to Settings → Agency Profile → Default folders (that settings section doesn't exist).

---

## M3 · Upload — Roster Shared Folder constraint

**Verdict: Partial (~30%)**

**Matches**
- Upload modal exists; picks folder + talent; supports file upload to the same underlying bucket.

**Key mismatches**
- UI is a `<select>` dropdown, not a **two-section row-based picker** with per-row doc counts, sizes, and Allowed/Blocked badges.
- Private Vault is **invisible** in our UI, not "visible but blocked". Prototype uses the blocked rows as teaching UX — you see the locked folders so you understand the access model.
- No danger banner at top explaining the constraint.
- Allowed set differs: prototype names **Endorsements** and **Invoices** as agency-uploadable folders — Endorsements is not a current folder, and Invoices is currently a separate billing module (not a doc folder).
- Blocked set (Family/Loved Ones, Medical/Insurance, Finance) has no representation at all in our data model.

---

## M4 · Document review — Resubmission workflow

**Verdict: Missing (entire feature)**

- We have no Review action, no request/fulfillment model, no reason codes, no resubmission history. Document status is a static badge (`filed / needs_review / ai_suggested`) with no state machine and no "reject with reason".
- Versions table exists but tracks owner re-uploads, not talent resubmissions against a rejection.

**Key mismatches**
- No `document_requests` entity linking a request to submissions and outcomes.
- No split-layout review page (preview + context + outcome radios).
- No reason-code enum (spec's six values: Unclear/blurry, Wrong document, Expired, Incomplete/missing pages, Wrong person/name, Other).
- No "Previous submissions" archive view; the archive-never-delete rule isn't enforced anywhere.

**Big-gap flag + dependency** — the resubmission half of the loop needs the Talent Portal to be genuinely testable. Building only the manager side means seeded/mock submissions until that portal exists.

---

## M5 · Quotes & Invoices

**Verdict: Partial (~65%)**

**Matches**
- KPI grid with 4 tiles, filterable table, status enum broadly overlaps, editor for quote/invoice, client rollup tab.

**Key mismatches**
- KPI #2: **Paid 30d** (prototype) vs Paid 90d (ours).
- KPI #4: **Conversion rate** (prototype) vs Late (ours) — different metric, requires quote→invoice link.
- **No "Shared with talent"** column/toggle on billing docs. No `shared_with_talent` column in `agency_billing_docs`.
- **No quote → invoice conversion.** No `converted_from_id` on billing docs, no "Convert to invoice" action, no "Converted → INV-…" cross-reference in the row.
- No "(re: talent name)" secondary line under client cell.
- No paid/overdue lock on financial edits (BR-INV-011).
- No branding footnote surfaced in UI (BR-INVB-001/002).
- Filter chips are `<select>` dropdowns in ours vs the prototype's chip row (All/Draft/Sent/Partially paid/Paid/Overdue/Quotes only). Notably no "Partially paid" status exists in our enum.

---

## M6 · Contract detail with cross-linked invoices

**Verdict: Missing (entire page)**

- Contracts today are just documents with `folder = "Contracts"`. No detail route, no tabs, no linkage to billing docs, no contract-level totals.

**Key mismatches**
- No breadcrumb pattern for `Talent Roster > [Talent] > Contracts > [Contract]`.
- No relationship between `talent_shared_documents` and `agency_billing_docs`. No FK, no "Related invoices" query.
- No contract metadata (counterparty, signed date, expires date, retention-protected flag surfaced on the header) as first-class fields. `talent_shared_documents.validity_expires_at` exists but no signed date / counterparty / value.
- No "Create invoice" pre-fill action from a contract.
- No Invoiced/Paid/Outstanding summary bar.

**Big-gap flag** — new schema decisions required: extend the documents table with contract fields (light), or introduce a `contracts` table (heavier). Trade-off is not obvious.

---

## M7 · Activity log

**Verdict: Partial (~25%)**

**Matches**
- Backend audit table exists (`agency_audit_log`) capturing admin actions with actor + action + metadata + timestamp.

**Key mismatches**
- **No UI route** to view the log. It's a table, not a screen.
- No filter chips (All / Talent activity / Document operations / Sharing / Invoice activity). Our `action` strings aren't grouped into these categories today.
- No **date range** selector, no **Export**.
- No **device / IP / city / country** capture. Adding IP + UA is straightforward from request headers; city/country needs a geo-IP lookup service.
- Coverage gap: prototype logs **talent-side events** too (talent uploads, talent shares with loved-one, talent accepts invite). Our audit log is agency-actor-scoped and would need broadening to be the source for M7's stream.
- No icon-by-type styling (upload=green, resubmission=amber, etc.).

---

## Summary matrix

| Screen | Verdict | Match % | Biggest gap |
|---|---|---:|---|
| M0 Empty state | Missing | 0% | Whole screen |
| M1 Dashboard | Partial | 30% | KPI set, warning banner, activity feed |
| M2 Onboarding modal | Missing | 0% | Modal + trigger point + canonical 6 defaults |
| M3 Upload | Partial | 30% | Row-based picker + visible-blocked rows |
| M4 Doc review | Missing | 0% | Request/fulfillment model + reason codes + archive |
| M5 Quotes & Invoices | Partial | 65% | Shared toggle, quote→invoice conversion, KPI swap |
| M6 Contract detail | Missing | 0% | Whole page + doc↔invoice linkage |
| M7 Activity log | Partial | 25% | UI, filters, IP/device/geo, talent-side events |

---

## Terminology — neutral flag with recommendation

| Prototype term | Current build term | Same thing? | Recommendation |
|---|---|---|---|
| **Talent Manager / Manager** | Agency / Agency Owner | Yes (portal role) | **Recommend adopt "Manager".** Pros: matches spec end-to-end, matches how the client is describing it. Cons: collides with our existing `manager` sub-role in `user_roles` (owner/manager/staff). Would need to rename sub-role (e.g. `lead` / `admin`) to avoid two "Manager"s. |
| **Talent Roster** | Talent (page label) | Yes | **Recommend adopt "Talent Roster".** Pros: cheap, no data-model impact, matches spec. Cons: none material. |
| **Roster Shared Folder** | Document Vault | Yes (agency-visible doc area) | **Recommend adopt "Roster Shared Folder".** Pros: prototype leans on this name to distinguish from Private Vault; the whole M3 teaching UX depends on the pair reading naturally ("Roster Shared Folder" vs "Private Vault"). Cons: longer name, existing sidebar/routes/toasts all say "Document Vault" — non-trivial copy sweep. Route path could stay `/agency/document-vault` even with UI rename. |
| **Private Vault** | (none — Talent Portal not built) | New concept | **Recommend adopt as-is when we build the Talent Portal.** For M3 purposes we only need the *label* to exist as a UI concept; no data-model work now. |
| **Unfiled Documents** | (none) | New concept | **Recommend defer decision.** Not clear from the M-screens alone whether this is (a) an inbox for talent uploads not yet placed in a folder, or (b) a manager-side triage queue. Ask client to define scope before naming. |
| **Document Requests** | (none — closest is `talent_shared_documents.status = 'needs_review'`) | New concept | **Recommend adopt "Document Requests" as a distinct entity.** Pros: cleanly models the request→submission→review loop M4 needs; separates "request lifecycle" from "document lifecycle". Cons: new table, new page, new server functions. This is the right abstraction if we're building M4 seriously. |
| **Agency Profile** (Settings area) | Settings | Overlap | **Recommend split.** "Settings" today mixes agency identity with operational preferences. Prototype implies **Agency Profile** = identity/branding/default folders, and **Settings** = everything else. Pros: matches M2's deep-link "Settings → Agency Profile → Default folders". Cons: minor IA refactor. |
| **Home** (sidebar) | Dashboard | Same landing | **Recommend keep "Dashboard".** Pros: more descriptive of what M1 actually is. Cons: diverges from spec label. Low-stakes either way. |
| **Activity Log** (sidebar) | (no sidebar entry) | Same as our audit table | **Recommend adopt.** Straightforward addition. |

**Meta-recommendation on terminology:** if you adopt Manager + Talent Roster + Roster Shared Folder + Agency Profile as a batch, it's one coordinated copy sweep touching ~15 files (sidebar, route heads, page titles, subtitles, empty states, toasts, audit action labels). If you adopt piecemeal you'll be revisiting the same files repeatedly. Cheaper to do the sweep once.

---

## What I need from you next

1. **Terminology batch** — accept, reject, or partial (which ones)?
2. **Phasing** — which screens do you want to tackle first? My suggested order given Talent-Portal is not built:
   - Terminology sweep (one PR) →
   - M0 (cheap) + M1 warning banner (cheap) →
   - M7 UI + IP/UA capture (unblocks M1 activity feed) →
   - M5 shared toggle + conversion (contained, high value) →
   - M1 activity feed + new KPIs (depends on M7 events) →
   - M2 onboarding modal + default folders →
   - M3 upload redesign →
   - M6 contract detail →
   - M4 (defer until Talent Portal, or build manager side against seed data).
3. **M4 timing** — build manager-side against seeds now, or park?
4. **M6 data model** — extend documents table with contract fields (light), or introduce a `contracts` table (heavier)?
5. **M7 geo** — ship without city/country first, add later; or add geo service now?
6. **Unfiled Documents** — get scope clarification from the client before I include it in phasing.

Approve any subset of these and I'll turn the answered ones into a concrete build plan.
