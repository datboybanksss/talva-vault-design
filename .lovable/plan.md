# Agency Talent Roster and Clients redesigns

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

## Clients card grid

- Replace the Clients table with a responsive three-column card grid.
- Build the requested top row with a wide icon-led search field using the exact placeholder **Search clients by company, contact or VAT...** and a primary **New Client** action.
- Make the card body open the client detail panel, with a chevron indicating the interaction; retain the shared kebab menu for edit/remove actions.
- Show deterministic initials, company name, client type, payment terms, contact name/title, and the live **Documents**, **Invoiced**, plus contextual **Outstanding** or amber **Overdue** amount.
- Keep all add/edit/remove and empty/loading/error behaviour, adapted to the card design.

### Client data rules

- Add database-backed `trading_name`, `client_type`, `company_registration_number`, `contact_title`, default `payment_terms_days`, and `relationship_manager_user_id` fields to saved clients; no inferred or sample labels.
- Extend the client form so agencies can maintain every new field directly, using the current Agency staff roster for relationship-manager selection.
- Aggregate document and payment figures only from billing documents linked to each saved client.
- **Documents** counts linked quotations and invoices; **Invoiced** sums linked ZAR invoices only.
- Remaining balance is invoice total minus recorded payments. Show **Overdue** only when a non-cancelled invoice has a past due date and a positive remaining balance; otherwise show total **Outstanding**.
- Use the existing ZAR formatter and do not convert non-ZAR documents without an exchange rate.

## Client detail panel

- Open a polished side panel from each card, with close control, matching avatar colour, client name, type/profile subtitle, type badge and **Client since [month year]**.
- Show live **Invoiced**, **Paid**, and **Overdue** stat cards using the same calculations as the grid.
- Add compact, divided label/value sections for:
  - **Company:** trading name, type, company registration number, VAT number.
  - **Primary contact:** name, role, primary saved email, phone and address.
  - **Billing:** payment terms and relationship manager.
- Render missing optional values as **Not provided**.
- Add the linked quote/invoice history with record count, number, type, ZAR amount and the existing billing status pill styles.
- Treat an unpaid past-due invoice as **Overdue** in this panel even if its stored status has not yet been synchronised.
- Each history row navigates to Quotes & Invoices with that exact record opened in the existing document editor; add validated search state to support this deep link.

## One-time payment note

- Add the supplied informational payment-tracking copy below the client grid as a dismissible neutral card, not a warning banner.
- Persist dismissal per signed-in agency user using the existing database-backed notification-dismissal pattern, so it does not reappear after closing.

## Technical details and verification

- Extend the existing authenticated roster/client server functions and paged document scans; keep every query scoped to the caller's agency.
- Apply one migration for the saved-client fields, preserving existing grants and RLS protections.
- Reuse the current agency member/profile data for relationship-manager labels and the existing invoice-payment records for paid balances.
- Add focused `tvp-*` styles using only existing semantic tokens and current typography; preserve dark-mode compatibility.
- Complete route metadata while touching the Talent Roster route.
- Run type checks and verify both grids plus the detail panel at desktop and mobile widths with an Agency session when available.
