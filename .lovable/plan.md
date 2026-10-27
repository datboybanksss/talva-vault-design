# POPIA talent registration — revised product-owner decision

## Admin talent invitations
- Remove the ID-copy upload slot and the Admin date-of-birth field. Proof-of-talent remains required with its existing upload, validation and cleanup handling.
- Remove ID-number collection from talent activation and any related talent displays/contracts. Do not add ID verification, file transfers, ID notifications or disposal settings.
- Block new talent invitation ID uploads at server and database boundaries, including pre-draft staging. Keep agency onboarding uploads entirely separate and unchanged.

## Talent acceptance
- Keep the legal-name and date-of-birth step. Validate actual calendar dates and compute age against today's date on the server before progression to password/Terms, and again at final activation.
- Under-18 attempts stop immediately and clear entered form data. Store only a neutral invitation failure outcome/time, with no submitted personal data or reason. Create no account, Terms proof, vault or two-factor setup. Inviters see only “This invitation couldn't be accepted”; the person sees neutral database-backed copy.
- Adult date of birth remains on the protected talent profile, never in agency responses. Preserve existing Terms proof and two-factor behaviour.
- Store new wording in database-backed configuration; use inline field/helper text, not warning banners.

## Approved existing-data erasure
- Erase the seven stored talent ID numbers and the two Admin-invite dates of birth, without creating backups. Block future writes to deprecated fields rather than dropping live columns.
- Delete held ID-copy files on unaccepted talent invitations through Storage, then remove their invitation references. Check current invitation status immediately before deletion; log counts/actions without copying personal values.
- Do not read, move, delete or otherwise change talent-uploaded Private Vault ID documents.

## Schema and rollback
- Apply additive schema/trigger changes through the migration tool. Keep the migration-history convention and explicit grants/RLS where applicable.
- Include reverse statements and dependency ordering for structural changes and document which application changes must accompany rollback.
- ID-number/DOB erasure and Storage hard deletion are approved and irreversible; structural rollback does not recover them and no backup will be created.

## Agency onboarding audit only
- Report whether onboarding currently requires the owner/authorised signatory's ID copy and whether any agency typed ID number is stored. Do not change that flow.

## Validation and delivery
- Add focused tests for proof-only sending/staging, removed ID collection, strict DOB dates and the exact 18th birthday, early/final server checks, no personal-data persistence on rejection, neutral inviter status, protected DOB, no Private Vault changes and future-write refusal.
- Run full tests, separate source/other-target lint and automatic TypeScript/build validation. Keep authored explicit-any at zero.
- No test-session minting or real-person Terms acceptance. State authenticated screen-check limitations honestly.
- Report exact changes, actual erased/deleted counts, schema mismatches, structural rollback and irreversible effects.

## Additional approved pre-launch fixes
- Add environment-file ignore rules and a placeholder-only example. Confirm whether Lovable Cloud supplies the required browser configuration to preview/published builds before changing tracked-file status; leave managed `.env` tracked if that cannot be established safely. Scan the visible repository and available history for private credentials without printing their values.
- Locate the earlier 116-site raw-error audit and rescan authored code. Route technical database/auth/network errors through the existing shared friendly-error helpers, preserving deliberate friendly messages and stable rule codes. Exclude two-factor files, MFA_ENFORCED and eslint configuration from changes; report any affected sites in those protected files as left unchanged.
- Extend the mapper for permissions, duplicates, save constraints and connection failures; test that technical internals cannot reach user messages and that a representative server function returns friendly text. Log technical details server-side only.
- Report actual sites/files fixed and leftovers, environment tracking status, full-suite results, separate lint totals and final automatic validation; mark each task complete only after verification.