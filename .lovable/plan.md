# Invoice email parity

## Changes

- Reuse the full billing-document email renderer for invoices, including line items, VAT, totals, notes and payment due date.
- Apply the same verified sending-address requirement and all-recipient delivery gate used for quotations.
- Keep failed or partial sends unchanged and show a clear error.
- Add a separate manual **Mark as sent** action that assigns a final invoice number without sending email.
- Keep **Print / Save PDF** unchanged.

## Verification

- Confirm invoice Preview shows **Send invoice**, manual **Mark as sent**, and print actions.
- Confirm server status updates happen only after complete delivery or explicit manual marking.
- Run the project typecheck and confirm Quotes & Invoices still loads.
