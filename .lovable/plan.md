
# Phase 5 — Retention Rules & Versioning (Agency Document Vault)

## 0. Ambiguities to flag before building

- **"Revoke access" without a Talent Portal.** Today, `talent_shared_documents` is agency-owned metadata + files in the `talent-documents` bucket. There is no talent-side account that "has access" to revoke. I'll treat "revoke access" as a future concept and design the schema so it fits, but the *only enforcement surface today* is: agency delete + agency-side "unshare/hide" toggle. I'll add a `revoked_at` column now (nullable) so the future Talent Portal reads `WHERE revoked_at IS NULL`, but no UI wiring to talent yet. **Confirm this is acceptable, or tell me you want a stub Talent view now.**
- **Retention scope key.** Vault rows have a free-text `folder` column (not FK to `agency_folder_template_items`). Rules therefore key on `(agency_id, folder_name)` string match, plus optional `document_category` (we don't have a category column today — proposal below adds one, defaulting from the folder). Confirm you want a category dimension, or keep it folder-only for v1.
- **Who can configure retention rules.** Assumption: agency **owner only** (staff can upload/view/delete but not set compliance policy). Say the word if staff should also edit rules.
- **Clock semantics.** Retention starts from `created_at` of the document (upload time). Alternative: from a "document effective date" field. I'll go with upload time unless you say otherwise.
- **Legal hold.** Not in the brief, but worth noting: an admin override to *extend* a lock beyond expiry (e.g. active litigation). Out of scope for v1; schema will leave room (`legal_hold boolean`) but no UI.

## 1. Schema

Two new tables + small additions to `talent_shared_documents`.

### `agency_retention_rules` (per-agency policy)
```text
id uuid pk
agency_id uuid fk agencies
scope             enum('folder','category','document')  -- v1 ships 'folder'; 'document' = per-doc override
scope_value       text            -- folder name, or category slug; null when scope='document'
document_id       uuid            -- only set when scope='document', fk talent_shared_documents
retention_years   int not null check (retention_years between 0 and 100)
description       text
created_by        uuid
created_at / updated_at
unique(agency_id, scope, scope_value, document_id)
```
Resolution order at enforcement time: **document override → folder rule → (no rule)**. No global default in v1.

### `talent_shared_documents` additions
```text
current_version_id  uuid          -- points to latest row in doc_versions
revoked_at          timestamptz   -- future Talent Portal read gate
locked_until        timestamptz   -- denormalised cache: max(retention_expiry across applicable rules); recomputed on insert/rule change
```
`locked_until` is a cache for cheap enforcement + UI badges; the source of truth is the rules table + `created_at`.

### `talent_shared_document_versions` (versioning)
```text
id uuid pk
document_id     uuid fk talent_shared_documents on delete cascade
version_number  int  not null    -- 1,2,3…
storage_path    text not null    -- each version = its own object in the bucket
name            text not null    -- filename at time of upload
size_bytes      bigint
mime_type       text
uploaded_by     uuid
created_at
unique(document_id, version_number)
```
"Replace" = insert a new version row, bump `current_version_id`, keep old storage objects. Download/View defaults to current; a "Version history" dialog lists prior versions with view/download (no delete while locked).

Storage layout stays `<agency_id>/<talent_link_id>/<uuid>-<filename>` — each version gets its own uuid so paths never collide.

### RLS / GRANTs
- Both new tables: `authenticated` + `service_role` GRANTs, RLS enabled, policies scoped via `is_agency_member(auth.uid(), agency_id)` (matches existing vault model — owner + staff).
- Rule **write** policies restricted to owners: `has_agency_role(auth.uid(), agency_id, 'owner')`. Confirm if you want staff to write too.

## 2. Enforcement (server-side, not just UI)

Locking is enforced in **three places**:

1. **`deleteAgencyVaultDocument` server fn** — before deleting DB row/storage, recompute the effective lock:
   - resolve applicable rule (doc override > folder rule)
   - `lock_expiry = created_at + retention_years`
   - if `now() < lock_expiry`, throw `Error("RETENTION_LOCKED: this document is locked until <date> by rule '<name>'")`
   - the UI catches the `RETENTION_LOCKED:` prefix and shows a toast with the unlock date.
2. **DB trigger `enforce_retention_lock` on `talent_shared_documents` BEFORE DELETE / BEFORE UPDATE OF revoked_at** — same check in SQL, using `locked_until` cache with a `now()` comparison. Defense in depth: even a direct SQL delete or a future Talent Portal action can't bypass it.
3. **After expiry**: nothing special — `now() >= locked_until` means both trigger and server fn pass, and delete behaves exactly like today.

**Version upload is never blocked by retention** (retention protects history, doesn't stop new versions).

**Rule changes recompute cache**: when a rule is created/edited/deleted, a server fn re-runs `UPDATE talent_shared_documents SET locked_until = ...` for affected rows. Also recomputed on document insert.

## 3. UI

### New sidebar item under Agency Portal: **"Document Rules"**
Route: `src/routes/agency.document-rules.tsx`. Sits between "Folder Templates" and "Document Vault" in the sidebar. Rationale: it's a distinct compliance concept, deserves its own page rather than burying in Settings.

Sections on the page:
- **Folder retention rules** — table: Folder name · Retention (years) · Description · Actions (edit/delete). "Add rule" dialog with folder dropdown (distinct folders present in vault + template folder names) + years input + description.
- **Per-document overrides** — table of documents that have an explicit override, with "remove override" action. Overrides are also creatable inline from the Document Vault row menu.
- **Preview panel**: "X documents currently locked, Y unlock in the next 90 days."

### Document Vault changes
- New column (or icon in the name cell): **🔒 lock badge** when `locked_until > now()`, tooltip "Locked by retention rule until <date> — cannot be deleted."
- Delete button on locked rows: rendered but **disabled**, tooltip shows unlock date. Server still enforces.
- Row menu gets **"Version history"** (opens dialog listing versions) and **"Upload new version"** (file picker → creates new version, bumps `current_version_id`).
- Row menu gets **"Set retention override"** (owner-only) → shortcut to create a `scope='document'` rule for that row.

### Folder Templates (`agency.folder-templates.tsx`) — small addition
Add an optional **"Default retention (years)"** field per folder template item. On template application (or manually), it becomes an `agency_retention_rules` row with `scope='folder'`. This keeps templates as the *authoring* surface for defaults, while the Document Rules page is the *management* surface. No breaking changes to the existing template flow.

## 4. Verification plan

- Seed a rule "Contracts / 10 years", upload a doc to folder "Contracts", confirm 🔒 badge, confirm delete throws `RETENTION_LOCKED`, confirm trigger also blocks a raw SQL delete.
- Backdate `created_at` past expiry, confirm badge clears and delete succeeds.
- Upload a new version, confirm old version still downloadable, `current_version_id` updated, storage retains both objects.
- Delete the rule, confirm `locked_until` recomputes to null and delete works.

## Open questions to answer before I build
1. `revoked_at` stub for future Talent Portal — OK to add now with no UI?
2. Rules keyed on folder string only, or add a `category` dimension?
3. Staff can edit retention rules, or owner-only?
4. Retention clock from upload time, or need a separate "effective date" field?
