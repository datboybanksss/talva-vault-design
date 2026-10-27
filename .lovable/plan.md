# POPIA talent registration

## Existing differences found
- Admin talent invitations currently collect **date of birth**, not a typed ID number. Remove that admin date-of-birth field too: the talent will supply it during acceptance.
- Typed ID numbers are collected during talent activation and stored on profiles. **Seven profiles contain stored ID numbers**; remove these values and stop all future collection.
- Two existing Admin invitations hold a date of birth and both required uploads. Neither is accepted. There are **no already-accepted Admin invitations with held ID files** to move in the current database.
- There is no stored admin ID-verification record yet.
- The private taxonomy has **Personal → ID**, not a folder literally called “Identity”. Use that existing database-backed destination, independently of AI preferences.
- Profile reads currently allow only the talent and TalVault admins, not agencies. Preserve that protection and check every server response for date-of-birth leakage.
- Revocation currently deletes invitation documents immediately; the daily expiry sweep also has no grace period. Change ID disposal to the configured 30-day period.
- The existing server checks age only at final submission, after the person has already reached Terms. Add an earlier server check before they can progress beyond profile details, and repeat it before account creation.
- This build currently has two-factor enforcement deferred/off. Preserve it; this change will not re-enable or redesign two-factor.

## Admin invitations
1. Remove typed ID collection/display throughout talent registration; stop collecting date of birth from admins.
2. Keep validated ID-copy and proof-of-talent uploads required before sending.
3. Add “ID verified” using the standard checkbox. Save the verifying admin and server timestamp, tied to the currently held ID document; replacing/removing that document invalidates verification.
4. Enforce verification and both uploads in the send operation and database write path, including resend paths. Explain missing requirements with inline helper text, not banners.
5. Keep held ID files admin-only; no automatic agency/vault exposure before acceptance.

## Talent acceptance
1. Use the existing profile-details step for confirmed legal name and date of birth; remove ID-number input. Validate real calendar dates and compute age server-side against the current date.
2. Before proceeding to password/Terms, check eligibility through the invitation token. Repeat the check at final activation so bypassing the form cannot create an under-18 account.
3. For an under-18 attempt, persist only a neutral invitation outcome and its timestamp—no submitted name, date of birth or other personal fields, no rejection reason. Clear the form state and stop the flow. The inviter sees only the database-backed “This invitation couldn't be accepted”; the person sees a neutral database-backed message.
4. For an adult, save date of birth on the protected talent profile and continue existing Terms proof and account flow. Check profile-update errors rather than reporting false success.
5. Move the held ID file using Storage's **cross-bucket move**, not copy, into the talent's Private Vault under Personal → ID. Register its existing validation receipt and remove the invitation document reference only after the move is confirmed.
6. Retain verification provenance on the invitation, including inviter/verifier identities and verification date; retain no ID file reference or typed ID number there.
7. Add a deduplicated bell notice linking directly to the private document. Use existing talent-controlled keep/replace/delete actions; do not apply agency retention protection or share it with an agency.

## Disposal and existing data
- Store the initial **30-day** disposal period and all new registration wording in database-backed configuration. Expose disposal configuration through the existing admin settings pattern.
- Record when an unaccepted invitation closes. Delete its held ID through Storage only when the configured interval has elapsed; check acceptance and transfer state again immediately before deletion. Log disposal without retaining document contents or ID numbers.
- Apply additive schema changes with explicit grants, RLS and validation triggers; use the migration tool and preserve the project's migration-history convention.
- Erase existing ID-number values through a separate data operation, and deprecate/block future writes to the old field rather than dropping a live column.
- Clear existing admin-invite date-of-birth values because admins should no longer collect them.
- Run an idempotent backfill for any accepted invitation holding an ID at execution time. Do not invent retrospective verification for records lacking proof.

## Rollback and irreversible effects
**Important:** schema/application rollback cannot restore erased ID numbers or hard-deleted files. Keeping a hidden backup would defeat the requested erasure, so this plan creates **no extra personal-data backup**.

- Record reverse instructions for every new trigger, policy, function, configuration entry and additive schema change, with dependency order and the pre-change function definitions.
- Stop the disposal/transfer worker before rollback; roll application code back without re-enabling typed ID collection or exposing date of birth to agencies.
- Keep a transfer journal with IDs/paths and states, but no document contents, to reconcile interrupted moves. A move can be reversed only while the talent's file still exists and has not been changed/deleted/shared, and only following an explicit authorised recovery decision. Never automatically take a talent-owned file back.
- Data erasure and completed hard deletion are **irreversible without an independently authorised pre-existing backup**. Mark that explicitly in the rollback runbook; do not promise full data restoration.

## Validation and report
- Focused tests for each rule: verification permissions/provenance, replacement invalidation, send/resend gates, genuine calendar dates, exact 18th birthday, under-18 no-account/no-personal-data path, neutral inviter outcome, private DOB access, true move and retry recovery, identity taxonomy independent of AI, bell navigation, talent-controlled deletion, configurable 30-day boundary and accepted-invite exclusion.
- Run the full suite, source/other-target lint separately, and check automatic TypeScript/build validation; authored explicit-any stays zero.
- No real-person Terms acceptance or test-session minting. Report authenticated screen checks as unverified if no approved test session is available.
- Final report will list exact changes, schema mismatches, data counts, migration/rollback steps, file moves/disposals, and verification limitations.

## Decision to confirm before irreversible changes
Approve erasing the seven stored ID numbers and the two Admin-invite dates of birth **without creating a recoverable copy**, with structural rollback only for those erased values. Preserve the current deferred two-factor behaviour.