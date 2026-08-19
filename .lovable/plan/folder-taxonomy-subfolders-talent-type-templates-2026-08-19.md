# Folder taxonomy: subfolders + talent-type templates

One schema pass covering categories, subfolders and talent-type templates together — no bolt-on.

## Decision needed first: restricted category access control

I checked for an existing "some agency staff can't see this" pattern. There isn't one.

- The talent Private Vault is restricted by `user_id = auth.uid()` — owner-scoped to the talent themselves. It is not a staff-visibility model and can't be reused here.
- Everything agency-side (`talent_shared_documents`, `agency_talent_folders`, `agency_talent_links`) uses one flat rule: `is_agency_member(auth.uid(), agency_id)`. Any member of the agency sees everything.
- The only finer-grained signals that already exist are `agency_talent_links.manager_user_id` (assigned manager) and `has_agency_role(user, agency, 'owner')`.

**Proposed approach** — extend the existing pattern rather than invent a permission model:

1. New security-definer function `public.can_access_talent_folder(_user_id uuid, _talent_link_id uuid, _restricted boolean)`:
   - not restricted → same as today, `is_agency_member`
   - restricted → `has_agency_role(..., 'owner')` OR `manager_user_id = _user_id` OR the talent themselves
2. Add `restricted boolean` to the category configuration, seeded `true` only for Medical, Fitness & Insurance.
3. Swap the SELECT/UPDATE/DELETE policies on `agency_talent_folders` and `talent_shared_documents` to route through that function, so restriction is enforced in the database, not only hidden in the UI.
4. UI: restricted categories carry a lock chip; staff without access don't see the folder or its documents at all (rows never reach them).

Two sub-decisions I need from you:

- **A.** If a talent has no assigned manager, should the restricted category fall back to owner-only (my default), or to all members?
- **B.** Should agency-wide admins (platform admins, `has_role('admin')`) retain visibility of restricted medical folders? Today they can read everything. My default: platform admins keep read access for support, and every read is written to the audit log.

## Schema

Three new tables, all agency-scoped and editable — the spec content is seeded as data, never as component arrays.

```text
folder_catalogue_categories      platform baseline, 10 rows
  slug, name, sort_order, restricted, ai_filing_allowed,
  default_validity_rule, recommended, can_untick

folder_catalogue_subfolders      platform baseline, per category
  category_slug, name, kind ('default' | 'optional'), sort_order

folder_type_template_items       talent-type additive templates
  talent_type, category_slug, subfolder_name, sort_order
```

Per-agency editing keeps working through the existing `agency_folder_settings` (category level) plus a new `agency_folder_subfolder_settings` (agency_id, category_slug, name, kind, enabled) which overlays the catalogue. Reading is always catalogue + agency overlay, so an agency can rename, disable or add subfolders without a code change.

`agency_talent_folders` gains `parent_folder_id`, `subfolder_name`, `source` ('default' | 'talent_type' | 'manual') and `restricted`, so provisioned subfolders are real rows with a known origin.

`BASELINE_TALENT_TYPES` expands to Athlete, Musician / Singer, Actor / Performer, Influencer / Content Creator, Presenter / Public Figure, Other — sourced from the template table, with `Artist` / `Model` mapped forward for existing rows.

## Provisioning logic

- On onboarding: applied categories create their Default subfolders, plus the talent type's additive rows, deduped case-insensitively per parent.
- On talent-type change: add newly-applicable subfolders only. Subfolders that no longer apply are left in place — if they hold documents they are flagged `needs_review` for manual action, never deleted.
- Optional subfolders are offered, not created.

## Screens

- **Manage Folders** and **Default Folder Selection**: each category row expands to its subfolders, with Default/Optional chips, enable/disable, rename and add — all writing to the agency overlay.
- **Folder Rules**: same expand/collapse, retention rule editable at both category and subfolder level.
- Restricted categories show a lock chip and a one-line explanation of who can see them.

## Migration safety

Existing `agency_talent_folders` rows stay valid — they become top-level category rows. Nothing is renamed or deleted in this pass; the rename log table already in place (`folder_taxonomy_rename_log`) records any mapping applied.

## Anything else needing your call

- **C.** "Travel Insurance" appears as Optional under both Travel & Visas and Medical, Fitness & Insurance. I'll keep both (different parents, so not a duplicate) unless you'd rather it live in one place.
- **D.** Several talent-type additions repeat a category's own defaults (e.g. Athlete adds "Medical Clearance", already a Medical default). These dedupe to a single row, marked as a default. No action needed unless you want them tracked as type-specific.
