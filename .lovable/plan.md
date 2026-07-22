## Gap report — current Quotes & Invoices vs reference

**Current state (verified from `src/routes/agency.quotes-invoices.tsx` + `public.agency_billing_docs` schema):**

- **KPI cards**: 4 flat text tiles (Outstanding / Paid 30d / Quotes pending / Conversion rate). No icon badges, no colored action-hint line. Metrics are money-focused, not workflow-focused like the reference.
- **Topbar**: H1 + subtitle + "New Quote" / "New Invoice" buttons. No "Reset filters" affordance.
- **Filters**: search + Type + Status + Client dropdowns. Missing: Talent filter, Sort dropdown.
- **Status chips row**: does not exist. Reference wants 6 colored chip cards mirroring the Talent Workspace pattern.
- **Table columns today**: Ref / Client / Talent / Type / Status / Amount / Issued / Due / Shared / Linked / actions. Reference wants: Reference (bold + subtitle) / Type / Talent / Client / Status / **Acceptance / Due Rule**. So: no subtitle line under the reference, and no "Acceptance / Due Rule" column.
- **Subtabs**: current page has a "Clients" subtab. Reference has no such subtab — pure workspace layout.

**Data model check (`agency_billing_docs` columns): `id, agency_id, kind, number, client_name, issued_at, currency, total_cents, status, due_date, notes, talent_name, shared_with_talent, converted_from_quote_id, contract_document_id`.**

- `doc_status` enum: `draft, sent, accepted, paid, overdue, cancelled`.
- `doc_kind` enum: `quote, invoice`.

Mapping reference concepts to real fields:

| Reference concept        | Maps to today?                                              |
|--------------------------|-------------------------------------------------------------|
| Quote Drafts KPI         | `kind='quote' AND status='draft'`                           |
| Invoice Drafts KPI       | `kind='invoice' AND status='draft'`                         |
| Quotes Accepted KPI      | `kind='quote' AND status='accepted'`                        |
| Late Invoices KPI        | `kind='invoice' AND status='overdue'`                       |
| Quote Sent chip          | `kind='quote' AND status='sent'`                            |
| Accepted chip            | `status='accepted'`                                         |
| Late chip                | `status='overdue'`                                          |
| **Partial chip**         | **No field. Requires new boolean or enum extension.**       |
| Reference subtitle line  | Could reuse `notes` (first line), no dedicated field today. |
| "Accept within 7 days"   | derived from `issued_at` → `due_date` for quotes            |
| "Payment due in 14 days" | derived from `issued_at` → `due_date` for invoices          |
| "Payment due after N days" | derived same way (invoice, future due)                    |
| "Partial payment allowed"| **No field.**                                               |
| "Accepted manually"      | **No dedicated marker.** Could infer for accepted quotes with no `due_date`. |

## Schema decisions to confirm before I build

1. **"Partial" chip + "Partial payment allowed" rule** — add `allow_partial_payment BOOLEAN NOT NULL DEFAULT false` to `agency_billing_docs`? (Preferred over extending `doc_status`, since a partially-paid invoice is still `sent`/`overdue`/`paid` semantically.) Or drop this chip/rule from scope if you don't want the schema change.
2. **Reference subtitle** — reuse `notes` (show first line as subtitle in table)? Or add a dedicated `description TEXT` column? Reusing `notes` avoids a migration.
3. **"Accepted manually"** — derive from `status='accepted' AND due_date IS NULL` (i.e. no auto acceptance window recorded)? Or add an explicit `accepted_manually` flag?

If you want the fastest path with no schema change: I'd derive rule text from `due_date` vs `issued_at`, reuse `notes` for the subtitle, drop the Partial chip, and mark manually-accepted quotes by absence of a due date.

If you want full parity with the reference: one migration adds `allow_partial_payment` + `description` (and I'll infer "Accepted manually" from `due_date IS NULL`, which is enough — no need for a separate flag).

**Recommendation: full parity path.** It's one small migration and it makes the UI match the reference exactly without visible "missing" chips.

## Build plan (assuming full-parity path is approved)

### Step 1 — Schema (single migration)
- Add `allow_partial_payment BOOLEAN NOT NULL DEFAULT false` to `agency_billing_docs`.
- Add `description TEXT` to `agency_billing_docs` (short label like "Brand campaign").
- No RLS/GRANT changes (table already has them).

### Step 2 — Server functions (`src/lib/agency.functions.ts`)
- `listAgencyBillingDocs`: return the two new fields.
- `upsertAgencyBillingDoc`: accept `description` and `allow_partial_payment` on input.
- No new functions needed.

### Step 3 — KPI cards (new component pattern)
- Replace `.tvp-finance-grid` block with a 4-card row using the same icon-badge treatment as the Talent Workspace KPI cards:
  - Quote Drafts — teal, `Pencil` icon, action-hint "Continue editing" (green when count > 0, muted when 0).
  - Invoice Drafts — purple, `FileText` icon, action-hint "Ready to complete".
  - Quotes Accepted — green, `CheckCircle2` icon, action-hint "Ready to convert" (only when unconverted accepted quotes exist).
  - Late Invoices — red, `AlertCircle` icon, action-hint "Needs follow-up" when count > 0.

### Step 4 — Workspace section
- Section heading "Quotes & Invoices Workspace" with "Reset filters" text-link on the right.
- Filter row: search box (`"Search by client, talent or reference…"`), Status dropdown, Talent dropdown (derived from distinct `talent_name`), Type dropdown, Sort dropdown (Newest / Oldest / Amount high→low / Amount low→high / Due date).
- Reset link clears search + all four filters.

### Step 5 — Status chip row
- 6 colored chip cards below the filter row, reusing the exact chip pattern from the Talent Workspace:
  - Quote Drafts (teal), Invoice Drafts (purple), Quote Sent (blue), Accepted (green), Partial (amber), Late (red).
  - Clicking a chip toggles the status filter (same UX as talent chips).

### Step 6 — Table redesign
- Columns: Reference (bold `number` + muted `description` subtitle) / Type / Talent / Client / Status / Acceptance / Due Rule.
- Move existing Shared / Linked / actions into a compact right-side cell (icons only, tooltips).
- Rule text derived per row:
  - `quote & draft/sent`: "Accept within N days" (if `due_date`) or "No acceptance deadline" (if not).
  - `quote & accepted`: "Accepted manually" (if `due_date IS NULL`) or "Accepted on time".
  - `invoice`: `allow_partial_payment` → "Partial payment allowed", else `due_date > issued_at` → "Payment due in N days" (or "after N days" when N > 30), else "Payment due on receipt", `overdue` → "Overdue by N days".
- Remove the current "Clients" subtab (out of scope for the reference; happy to leave a "View clients" link if you want, but reference doesn't show it).

### Step 7 — Editor form additions
- Add "Description" text input (short label).
- Add "Allow partial payment" checkbox (only shown when kind = invoice).

### Step 8 — Verify
- Sandbox is `signed_out` (confirmed last turn) so I'll verify via a fresh seed record on the "NPI Talent Management" agency: insert one quote and one invoice with representative values, then screenshot instructions for hard-refresh — same pattern as recent turns.

## Open questions before I build

1. Confirm the full-parity path (schema + description + partial flag) vs the no-migration path.
2. Keep the current "Clients" subtab, or drop it to match the reference?
3. Any preference on which chip is "primary" on load (e.g. show all, or default-filter to "Late")?
