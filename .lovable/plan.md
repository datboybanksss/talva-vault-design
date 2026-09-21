# Agency Talent Roster and Clients card redesigns

## Talent Roster

- Replace the current roster table with a responsive three-column card grid, collapsing to two and one column on smaller screens.
- Use the exact heading **Talent Roster** and subtitle **Invite and manage Talent relationships**.
- Add one **Invite Talent** action to the Agency top controls beside the existing notification/avatar area when this page is open, plus the second action above the card grid.
- Replace the current status row with compact segmented tabs for **Active (N)**, **Invited (N)**, **Ended (N)** and **All**, calculated from the live roster response. The selected tab gets the raised surface treatment.
- Retain search, lead/type filtering, CSV export, loading/empty states, and the shared kebab action for changing talent type.
- Render cards with a live profile photo when available, otherwise deterministic initials rotating through existing semantic colour tokens.
- Show live name, talent type/category, actual relationship status, relationship date, and **Documents**, **Awaiting**, and **Expiring** counts.

### Roster data rules

- **Active** groups `active`, `needs_review`, and `read_only`; **Invited** is `invited`; **Ended** groups `ended`, `expired`, and `revoked`; **All** shows every returned relationship.
- The card badge preserves the exact database status and its existing shared label/tone.
- **Awaiting** counts non-revoked documents marked pending review, AI suggested, or `needs_review`.
- **Expiring** continues to use the agency's configured expiry-notice period.
- The relationship creation date is the existing canonical **Since** date; invited cards use **Invited [date]** instead.

## Clients

- Replace the Clients table with a responsive three-column card grid.
- Build the requested top row with a wide icon-led search field using the exact placeholder **Search clients by company, contact or VAT...** and a primary **New Client** action.
- Make each card open that client's existing details/edit dialog, with a chevron indicating the interaction; retain the shared kebab menu for edit/remove actions.
- Show deterministic initials, company name, client type, payment terms, contact name/title, and the live **Documents**, **Invoiced**, plus contextual **Outstanding** or amber **Overdue** amount.
- Keep all add/edit/remove and empty/loading/error behaviour, adapted to the card design.

### Client data rules

- Add database-backed `client_type`, `contact_title`, and default `payment_terms_days` fields to saved clients; no inferred or sample labels.
- Aggregate document and payment figures only from billing documents linked to each saved client.
- **Documents** counts linked quotations and invoices; **Invoiced** sums linked ZAR invoices only.
- Remaining balance is invoice total minus recorded payments. Show **Overdue** only when a non-cancelled invoice has a past due date and a positive remaining balance; otherwise show total **Outstanding**.
- Use the existing ZAR formatter and do not convert non-ZAR documents without an exchange rate.
- Extend the client form so agencies can maintain the new type, contact title and payment terms values directly.

## One-time payment note

- Add the supplied informational payment-tracking copy below the client grid as a dismissible neutral card, not a warning banner.
- Persist dismissal per signed-in agency user using the existing database-backed notification-dismissal pattern, so it does not reappear after closing.

## Technical and verification

- Extend the existing authenticated roster/client server functions and existing paged document scans; keep every query scoped to the caller's agency.
- Apply one migration for the three new client fields, with existing table grants/RLS unchanged.
- Add focused `tvp-*` styles using only existing semantic tokens and the current typography; preserve dark-mode compatibility.
- Complete route metadata while touching the Talent Roster route.
- Run type checks and verify both layouts at desktop and mobile widths with an Agency session when available.
