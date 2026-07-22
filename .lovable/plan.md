## 1. Delete invitation (destructive)

New server fn `deleteAgencyInvitation({ id })` in `src/lib/admin.functions.ts`:
- Assert admin-can-edit.
- Load invitation → must exist and `status IN ('pending','expired','revoked','declined')`. Refuse if `accepted` (safety: real agency exists now).
- Delete any uploaded compliance docs (storage objects + rows — see §3).
- Delete the linked `agencies` row **only if** `status='invited'` and no `agency_members` rows exist (i.e., it's a pure shell). Otherwise leave it.
- Delete the `agency_invitations` row.
- Write `admin_audit_log` entry `action='delete_agency_invitation'` with a snapshot of the deleted row in `detail` (so the deletion itself is auditable even though the row is gone).

UI: on `/admin/invitations` and `/admin/agencies` rows in "Invited" status, add a red Trash icon **next to** the existing Revoke button (Revoke stays, unchanged). Clicking opens a shadcn `AlertDialog` confirmation (not `window.confirm`) that spells out: "Permanently deletes the invitation and the empty agency record. This cannot be undone. Use Revoke instead if you need an audit trail." Requires typing the agency name to enable the Delete button.

## 2. Compliance documents move to the admin (invite creation form)

Confirmed: the Agency Activation Wizard (`src/routes/invite.$token.tsx`) has **no** supporting-docs step wired in — nothing to remove there. The current `admin.invitations.new.tsx` only shows a static checklist; no upload logic exists yet.

### Schema (new migration)

```sql
CREATE TABLE public.agency_compliance_documents (
  id uuid PK default gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES agency_invitations(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  business_type text NOT NULL CHECK (business_type IN ('formal','informal')),
  doc_slot text NOT NULL,        -- 'cipc' | 'director_id' | 'proof_of_address' | 'contact_number' | 'sa_id' | 'mobile_number'
  file_name text NOT NULL,
  storage_path text NOT NULL,    -- '<invitation_id>/<slot>-<uuid>-<filename>'
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz default now()
);
-- Grants + RLS: admins (has_role admin) can select/insert/delete; service_role all.
-- No anon/authenticated-agency access — these are admin-only compliance files.
```

Slot allowlist per type:
- Formal: `cipc`, `director_id` (multi — allow 1..N rows), `proof_of_address`, `contact_number`
- Informal: `sa_id`, `mobile_number`, `proof_of_address`

Note: "contact_number" and "mobile_number" are text fields, not files — captured as `text` columns on `agency_invitations` (`registered_contact_number text`, `registered_mobile_number text`) rather than uploads. Everything else is a file.

### Storage

New **private** bucket `agency-compliance-docs`. RLS on `storage.objects` restricting access to admins only (path prefix `<invitation_id>/`).

### Server functions (add to `src/lib/admin.functions.ts`)

- `getComplianceUploadUrl({ invitation_id, doc_slot, file_name })` → signed upload URL via `supabase.storage.from('agency-compliance-docs').createSignedUploadUrl(path)`.
- `recordComplianceDocument({ invitation_id, doc_slot, file_name, storage_path, mime_type, size_bytes })` → insert row.
- `listComplianceDocuments({ invitation_id })`.
- `deleteComplianceDocument({ id })` → remove storage object + row.

### Invite creation flow rework (`admin.invitations.new.tsx`)

Two-phase form (invitation row must exist first so we have an ID for storage paths + FK):

1. **Step 1 — Details**: name, contact person, email, business type, expiry. Submit creates the invitation row in a new `status='draft'` state (schema: extend `agency_invitations.status` allowed values). No email/notification side-effects yet.
2. **Step 2 — Compliance documents**: dynamic slot list based on `business_type`. Each slot shows a drag-drop uploader (reuse `UploadDialog` styling). Multiple-file slot for Director IDs. Text inputs for phone numbers. Live checklist showing ✓/✗ per required slot.
3. **"Create & send invitation" button** disabled until every required slot has ≥1 uploaded doc and text fields filled. On click: flips `status` from `draft` → `pending`, sets `expires_at`, writes audit log.

Cancel/leave in draft state → the Invitations list gains a "Draft" chip; drafts can be resumed or deleted (via the §1 delete flow — drafts count as "not accepted").

### Validation summary

| Check | Where |
|---|---|
| Business type selected | Step 1 client + Zod |
| All required file slots have ≥1 doc | Client (button gate) + server on `finalize` |
| Text fields non-empty | Client + Zod |
| Only admins can upload/finalize | `assertAdminCanEdit` in every fn |
| Storage path scoped to invitation_id | Server builds path, never trusts client |

## Order of build

1. Migration: bucket policies won't run yet — first the table, grants, RLS, `status='draft'` allowance, phone-number columns.
2. Storage bucket creation (tool call).
3. Storage RLS policy migration.
4. Server functions (delete + compliance CRUD + finalize).
5. UI: rework `admin.invitations.new.tsx` into 2-phase form.
6. UI: add Delete action + confirmation dialog on both list pages.
7. Manual verify: create draft → upload each slot → finalize; delete a draft; delete a pending invite; confirm agency shell disappears.

## Out of scope (flagged, not doing)

- Emailing the invite (still blocked on `talvault.com` DNS).
- Exposing these docs to the agency portal — admin-only for now.
- Re-uploading / versioning individual compliance docs post-acceptance (delete + re-upload only).