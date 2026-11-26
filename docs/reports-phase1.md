# Reports Phase 1 — deployment and rollback

## Scope
Reports roles apply only to Reports, Reports downloads, reserved messaging permissions and Settings → Reports access. Existing Admin permissions remain authoritative on all other Admin screens, including standalone Launch records and Terms. An administrator may already view operational records outside Reports; this is intentional and does not grant Reports downloads or access management.

Owner: view, raw download, explicit email inclusion, reserved send/approve and access management. Operations: view, redacted raw download and reserved send/approve. Analyst: view and redacted raw download. Viewer: view only. Messaging is not implemented. Explicit Reports access changes protect the last active Owner and are audited. Existing administrator suspension/removal controls are not vetoed by Reports roles.

## Phase 1 delivered
- Eight-tab foundation; Growth, Agencies and Business clearly retain unavailable future analysis rather than fabricate figures. Underlying People evidence is available under the same filters.
- Shared URL period/comparison/Real-Test-All/type/agencies/linkage/source/joined/status filters; private saved views; People search/stage/activity/contributor filters.
- SQL-paged People, zero observed activity, selection/columns, timeline, CSV and Excel. Reusable calculation definitions and sign-in cards.
- Relationship and sign-in/visit raw evidence; Launch tables use the complete shared filtered SQL roster, exclude draft/connection-request invitations from Reports invitation figures, preserve Real-only offer allocation, redact addresses before responding, and page all exports.
- All section downloads state their underlying dataset; unavailable future analysis is not labelled as calculated. People downloads export every matching person, not selection/page only. Relationship/event downloads export their own records, not misleading People rows. Launch downloads retain proof metadata and omit emails.

## Definitions v1.0
Source: `src/lib/reports-definitions.ts`. Talent onboarding is the talent's own validated upload only, persistent after deletion. Agency engagement requires action on the exact talent relationship/document/request/invitation; a staff sign-in alone does not qualify. Talent activity remains sign-in or Vault action. Trusted-contact successful-code visits are separate from logins. Registration evidence is not activation completion. Legacy profiles remain included; missing dates are disclosed, never substituted. Incomplete capture cannot prove inactivity.

## Applied history
Applied tool migrations 0026–0038 are mirrored as guarded history under `supabase/migrations/20261125000026_*` through `20261125000038_*`. Copies do nothing when the change is present. Original broad operational policies (0026/0030) are obsolete: corrections 0034/0035 remove them, including the lifecycle veto; do not restore these restrictions.

Publish the matching application changes after verification. Database corrections and audited role assignments are already live. Two-step settings, Test accounts, existing invitations and documents are unchanged.

## Permission verification
`src/lib/reports-permissions-db.test.ts` clones installed functions onto temporary fixtures and rolls back. It verifies the complete four-role matrix, signed-out/non-admin/account/MFA rejection, Viewer browsing/download rejection, independent email permission, legacy raw-path denial, access management, last Owner and audit, and absence of broad operational restrictions. These are isolated tests, not sign-in sessions or Test-account alterations.

Browser verification must use real existing authorised sessions: Owner and Operations CSV/Excel/Launch/evidence downloads, Viewer rejection, private-view save/read/delete, timeline, shared filters, desktop/mobile/light/dark. Never accept Terms or modify accounts to achieve a check. Failed/unavailable session restoration must be reported, not replaced with invented test sessions.

## Rollback preserving evidence
Roll back Reports UI/server changes, not operational Admin restoration. Disable Reports by revoking authenticated execution on these exact endpoints, retaining all evidence and configuration:

```sql
REVOKE EXECUTE ON FUNCTION public.reports_options() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reports_people_page(date,date,jsonb,integer,integer,text,text,boolean,timestamptz,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reports_sign_in_summary(date,date,jsonb,date,date,timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reports_person_timeline(text,date,date,jsonb,integer,timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reports_north_star(date,date,jsonb,timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reports_evidence_page(date,date,jsonb,text,integer,integer,timestamptz,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reports_set_access(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_sign_in_page(date,date,text,text,text,uuid,text,text,integer,integer,timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_sign_in_summary(date,date,text,timestamptz) FROM authenticated;
```

Use a forward migration for revokes/re-grants; do not delete applied history. Retain access rows, milestones, private saved views, export receipts, audit and uploaded documents. Reports role rollback is a separately approved, audited data change; never revert user_roles, invitations, account flags, legal proof or MFA settings. Do not reintroduce broad Admin policies or storage/operational RPC guards. Re-enable only the endpoint grants above after the matching app is verified.

## Release status (26 November 2026)
- Product-owner decision: both Lara Admin accounts (`laranel@outlook.com`, `admin1@talvault.com`) are Reports Owners, with audit entries. Israel Noko remains Owner; Lindo Noko and Omar-Raphael Tabengwa are Operations.
- Owner browser verification passed (desktop/mobile, light/dark): eight tabs, People CSV/Excel downloads, email-free default and explicit email inclusion, Reports access page and an audited role change that was reversed.
- Operations browser verification is still outstanding: specific-account sign-in is unavailable in this environment. Operations and last-Owner rules are covered by the database permission tests.
