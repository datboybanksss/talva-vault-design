# Send quotations from Preview

## What will change

1. **Real quotation delivery**
   - Reuse the existing authenticated billing-email service and the agency’s verified sending-address configuration.
   - Send to the recipient address(es) shown in Preview, using the agency name in the sender label and the verified agency address as Reply-To.
   - Include the complete quotation in the email: quotation number, client, dates, line items, VAT, totals, notes and agency details.
   - The current email provider interface does not support file attachments, while the app’s PDF is produced locally by the browser print dialog. For this pass, the full printable quotation will be rendered in the email body; **Print / Save PDF** remains the way to create a local PDF.

2. **Correct status and failure handling**
   - Require a verified billing sending address before the platform send action is enabled.
   - Update the quotation to `sent` only after every intended recipient has accepted delivery successfully.
   - If delivery fails or is only partially successful, leave the quotation’s status unchanged and show a clear reason; never silently mark it sent.
   - Record the successful send in the existing agency activity log with recipients, sender and Reply-To details.

3. **Preview actions**
   - Keep **Print / Save PDF** unchanged.
   - Make **Send quote** the primary action, with accurate sending/progress wording.
   - Keep **Mark as sent** as a secondary manual action for quotations sent outside TalVault, using the existing status-update path and activity logging.
   - Keep unsaved drafts and quotations without recipients disabled with clear tooltips.

4. **Invoice scope**
   - The invoice preview uses the same shared send path and has the same underlying defect: failed email attempts can still mark an invoice as sent.
   - Per the requested scope, the new delivery action and stricter transition will be enabled for quotations only. Invoice behaviour will not be redesigned in this change.

## Technical details

- Extend the billing email renderer to accept the persisted quotation, its line items and agency billing/branding details.
- Harden the authenticated quotation-send server function so verification, recipient validation and delivery success happen before the database status transition.
- Add a separate manual `sent` action in the preview UI rather than overloading the delivery button.
- Preserve RLS agency scoping and existing audit patterns; no new public endpoint or secret is required.

## Verification

- A saved draft quotation with a recipient and verified sender emails successfully, then becomes `sent`.
- A missing/unverified sender, missing recipient or provider failure leaves the quotation as `draft` and shows a useful error.
- Manual **Mark as sent** changes status without attempting email.
- Print still opens the current-page print dialog.
- Invoice preview remains unchanged and the app passes its code checks.
