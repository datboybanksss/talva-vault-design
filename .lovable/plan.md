# Client management for Quotes & Invoices

Agencies currently retype client details on every quote and invoice. This adds saved client records that can be reused, each with a contact person and several email addresses.

## What the agency will get

**A new "Clients" tab under Agency Profile (Settings)**
- A table of saved clients: client/company name, contact person, email addresses, phone, city.
- Add, edit and remove clients from here. Removing a client never changes quotes or invoices already issued to them.
- Empty state explains what clients are for and offers "Add your first client".

**Picking a client when creating a quote or invoice**
- A "Client" picker at the top of the client section of the New Quote / New Invoice form, searchable by name or contact person.
- Choosing a saved client fills in the client name, contact person, billing address, VAT number and email addresses.
- Email addresses appear as tick-boxes of that client's saved emails, so one or several can be chosen as recipients. Extra one-off addresses can still be typed in, exactly as today.
- Choosing "One-off client (enter manually)" keeps today's free typing, plus a "Save this client for next time" tick-box that creates the record when the document is saved.

**First-time prompt**
- If an agency opens New Quote / New Invoice with no saved clients yet, the form shows a short prompt at the top with a "Set up clients" link to the new Settings tab. It is a prompt, not a block — they can still type details manually and carry on.

## Data changes

New table `agency_clients`:
- agency_id, name, contact_person, emails (list), phone, address, vat_number, city, country, notes, archived_at, created_at/updated_at.
- Row-level access: only members of the owning agency can read or write their own clients; service role full access.
- Quote/invoice documents gain an optional `client_id` link plus a `recipient_contact_person` field, so an issued document keeps the details as sent even if the client record later changes.

Nothing is seeded — the list is empty until an agency adds its own clients.

## Technical notes

- Migration creates `agency_clients` (with GRANTs then RLS policies scoped via `is_agency_member`), an `updated_at` trigger, and adds `client_id` / `recipient_contact_person` to `agency_billing_docs`.
- New server functions in `src/lib/agency.functions.ts`: `listAgencyClients`, `saveAgencyClient` (insert/update), `archiveAgencyClient` — all behind `requireSupabaseAuth`, with Zod validation (trimmed, lower-cased, de-duplicated emails, max 20).
- `saveAgencyBillingDocFull` accepts `client_id`, `recipient_contact_person`, and optional `save_client` to create a client record from manual entry; `getFullAgencyBillingDoc` returns them.
- New `src/components/agency/clients-panel.tsx` using existing `tvp-card`, `SectionHeader`, `ModalShell`, `Input`, `Label`, `Textarea`, `RowActionsMenu` patterns; registered as a `clients` tab in `src/routes/agency.settings.tsx`.
- Editor changes are contained to `src/routes/agency.quotes-invoices.tsx`: client picker (shadcn `Select` + search), contact person field, saved-email tick list feeding the existing `EmailChipsInput` value.
- Contact person is shown on the printed/emailed document via `src/components/agency/billing-document.tsx` (Attn: line) so sent copies address the right person.
- UK/South African spelling throughout; all values read from the database.
