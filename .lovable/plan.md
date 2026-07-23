# Quotes & Invoices — real settings, branding, VAT, SARS-compliant docs

## Current state (verified)

- `agency_billing_docs` has one flat `total_cents` per doc — no line items, no VAT breakdown, no issue/reference to a supplier VAT number, no addresses. `allow_partial_payment` already exists per row (reuse it).
- `agencies` has no fields for default acceptance window, payment terms, VAT registration, VAT rate, logo, or accent color.
- `QuotesInvoicesSettingsPanel` is a placeholder with the "Not yet wired" banner — no persistence, no state.
- No PDF/document generator anywhere in the project. Quotes/invoices exist only as table rows; nothing is rendered for the client or exportable for SARS today.
- No storage bucket for agency branding assets.

That last point is the biggest surprise, so calling it out up front: today an agency literally cannot send or download a quote/invoice document — everything lives in the internal table. This build introduces the first real client-facing document artifact.

## Recommendations to confirm

1. **Overdue marking** — keep manual via the Status dropdown for now. Automating it needs a scheduled job (pg_cron) and touches money/audit; ship the setting + a visual "would be overdue" badge on the row now, wire automation in a follow-up. Flagging as recommended, not building yet unless you say otherwise.
2. **Color scheme** — MVP as a preset palette of ~6 brand-safe accents (Teal, Navy, Emerald, Plum, Slate, Amber) plus optional custom hex. Keeps the preview readable and avoids a11y issues from arbitrary colors on white.
3. **PDF vs HTML preview** — do the preview as an in-app HTML render (same component the client will see) and generate the downloadable/emailable PDF from that same component using `@react-pdf/renderer` (pure JS, Cloudflare Worker compatible; no Puppeteer/Chromium). Confirm this is acceptable — the alternative is a server-side headless-Chrome render which isn't available on the Worker runtime.
4. **VAT model** — store amounts as **exclusive** (net) at the line level; compute VAT and gross at render time from the line's VAT rate. Migrate the existing single `total_cents` into a single line item on read so old rows don't break.

## Build order

1. **Schema + settings persistence** (backend only, no UI change yet)
2. **Line items + VAT breakdown** on the editor and list totals
3. **Agency branding**: logo upload + accent color, saved on agencies
4. **SARS-compliant document component** (HTML render, used for preview)
5. **PDF export** from the same component + "Preview before send" dialog
6. **Real Settings tab UI** replacing the placeholder panel
7. **Apply settings to new docs** (default acceptance window / payment terms auto-fill; overdue visual badge)

## Schema changes

**`agencies` — new columns**
- `default_quote_acceptance_days int` (default 14)
- `default_quote_reminder_days int` (default 3)
- `default_invoice_payment_days int` (default 30)
- `invoice_overdue_grace_days int` (default 0)
- `is_vat_registered boolean` (default false)
- `vat_number text` (used on invoice header when registered)
- `default_vat_rate_bp int` (basis points, e.g. 1500 = 15%; SA standard)
- `billing_address text`
- `logo_path text` (storage path in `agency-branding` bucket)
- `accent_color text` (hex, default `#064E58` — current teal token)

**`agency_billing_docs` — new columns**
- `recipient_address text`, `recipient_vat_number text`, `recipient_email text` (SARS: required on invoices ≥ R5000)
- `subtotal_cents bigint`, `vat_cents bigint` (persisted totals; `total_cents` becomes gross)
- `vat_rate_bp int` (rate captured at issue time)
- `is_vat_invoice boolean` (drives "Tax Invoice" vs "Invoice" header)
- `acceptance_window_days int`, `payment_terms_days int` (snapshot of settings at issue time so future setting changes don't rewrite old docs)
- `sent_at timestamptz`, `accepted_at timestamptz`, `paid_at timestamptz` (needed for reminder cadence and overdue math)

**New table `agency_billing_doc_lines`**
- `id, doc_id (fk), description text, quantity numeric(12,3), unit_price_cents bigint, vat_rate_bp int, sort_order int, timestamps`
- RLS scoped through parent `doc_id` → `agency_id` membership; standard GRANTs.

**New storage bucket `agency-branding`** (private)
- RLS on `storage.objects`: read/write scoped to authenticated agency members of the folder-prefix agency. Signed URLs for rendering in preview/PDF.

**Sequential numbering**
- SARS requires unique sequential invoice numbers. Add a Postgres sequence per agency via a `agency_billing_counters(agency_id, kind, next_value)` table + `SELECT ... FOR UPDATE` in a server fn that mints the number at "send" (not draft), so drafts don't burn numbers. Prefix format `INV-{year}-{0000}` / `QT-{year}-{0000}` — configurable later.

## Document component (SARS checklist mapped)

Single React component `BillingDocument` used for both HTML preview and `@react-pdf/renderer` PDF export. Fields, all required for SA tax invoices:

- Header: "Tax Invoice" if `is_vat_invoice`, else "Invoice" / "Quote"
- Supplier block: agency logo, name, billing address, VAT number (if registered), primary contact
- Recipient block: client name, address, VAT number (shown on invoices ≥ R5000; validated at send time)
- Doc meta: sequential number, issue date, due date (invoices) / valid-until (quotes)
- Line table: description, qty, unit price (excl.), line VAT rate, line VAT, line total (incl.)
- Totals: Subtotal (excl. VAT), VAT @ rate, **Total incl. VAT**
- Footer: payment terms, banking details from agency profile, notes
- Accent color pulled from `agencies.accent_color`; logo from signed URL

Preview dialog: renders the component in a modal with a "Send" button that (a) mints the sequential number if still draft, (b) sets `sent_at`, (c) toggles status to `sent`. "Download PDF" button uses the same component.

## Settings tab UI (real)

Replace `QuotesInvoicesSettingsPanel` with 4 cards, each with its own Save button and mutation:

1. **Quote Acceptance** — acceptance window (days), reminder cadence (days). Applied as defaults when creating a new quote (snapshot into the row).
2. **Invoice Payment** — payment terms (net days), overdue grace (days). Applied on invoice create. Overdue visualization: rows past `due_date + grace` get a red "Late" chip automatically in the list even if status is still "sent" — but the enum stays manual per your call, confirmed unless you disagree.
3. **VAT / Tax** — VAT-registered toggle, VAT number, default VAT rate (%). Toggling registered on with no VAT number is blocked.
4. **Branding** — logo upload (drag/drop, PNG/JPG/SVG, private bucket, signed URL preview), accent color (preset swatches + custom hex).

## Server functions (new / changed)

New: `getAgencyBillingSettings`, `updateAgencyBillingSettings` (one per card or one combined — leaning combined with partial payloads), `uploadAgencyLogo` (returns storage path), `getAgencyLogoSignedUrl`, `listBillingDocLines`, `upsertBillingDocLines`, `sendBillingDoc` (mints number, sets status).

Changed: `upsertAgencyBillingDoc` accepts line items and computes subtotal/VAT/total server-side (never trust client totals); `listAgencyBillingDocs` returns new snapshot fields.

## What's explicitly out of scope for this pass

- Email delivery of the PDF (blocked on `talvault.com` domain verification — same reason invitations don't send yet). "Send" flips status and mints the number; actual outbound email queues once the domain is live.
- Automated overdue cron.
- Multi-currency VAT logic (we still store currency but SARS format assumes ZAR / 15%).
- Client-side signature capture on quote acceptance.

## Verification steps

- Create a quote with 2 line items at 15% VAT → subtotal, VAT, and gross match hand calc; preview shows all SARS fields.
- Toggle VAT-registered off → header changes to "Invoice", VAT column hidden, no VAT number rendered.
- Upload logo + pick accent → preview reflects both; PDF download matches preview.
- Change default payment terms to 45 → next new invoice pre-fills 45; existing invoices unchanged (snapshot preserved).
- Send a draft invoice → gets `INV-2026-0001`; next one gets `0002`; drafts deleted before send don't consume numbers.
