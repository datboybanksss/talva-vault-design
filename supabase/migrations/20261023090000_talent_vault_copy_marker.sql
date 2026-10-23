-- Talent "Copy to agency shared folder": audit-only marker on the copy.
-- Records that a shared document originated as a copy from the talent's
-- Private Vault. Timestamp only; never exposes the original's location or
-- folder to the agency.
-- Rollback: alter table public.talent_shared_documents drop column if exists copied_from_vault_at;
alter table public.talent_shared_documents
  add column if not exists copied_from_vault_at timestamptz;
comment on column public.talent_shared_documents.copied_from_vault_at is
  'Audit-only: when this document was copied from the talent''s Private Vault. Never shown with private folder/location detail.';