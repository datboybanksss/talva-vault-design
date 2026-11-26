# Reports historical design update

## Implemented
- Isolated Reports semantic tokens, 44px filters, scoped searchable agency checkbox dropdown, labelled footer actions/private saved views, underline tabs and real refresh time.
- Historical sources span 13 July 2026 onwards. Old and session-bound login rows are deduplicated by actor/session or exact retained timestamp. Explicit missing sign-in windows prevent zero-filled chart weeks or inferred dormancy.
- Overview, Growth, Engagement, Agencies and Business render historical cards, trends, onboarding funnels, retention, document depth/types, contact visits, agency performance and growth by month.
- Business uses Real accounts. Unknown plan prices, free-period dates, launch sheet and acquisition spend are disclosed rather than invented.
- Ten metadata datasets offer CSV/Excel and ZIP downloads, email omission by default, existing email permissions and receipts. Full-history exports use all accounts and today's SAST cut-off.
- Migrations 0039–0041 have byte-identical canonical copies in supabase/migrations, with rollback comments. No account data, roles, two-step settings or Test flags changed.

## Verification
- Owner laranel@outlook.com: all eight tabs at 1280px/390px, light/dark; no page overflow, page errors, loading failures or developer wording in the Reports area.
- All time begins 13 Jul 2026; CSV includes September login history. CSV, Excel and ten-dataset ZIP downloads exercised; ZIP has no email addresses by default.
- Initial regression run: 448 passed/5 skipped; lint 0 errors/43 existing warnings; automatic build OK.

## Release gaps — do not claim exact design completion
- Test, test123, test2 and Agency test are flagged Real in stored data. They remain visible under Real; QA Test Agency is correctly excluded. User forbids flag/account changes, so classification requires separate approval.
- Add monthly spend is not implemented; it needs approved storage/permissions. Verified launch sheet, prices and free-period dates are absent.
- Investor pack currently downloads historical raw datasets, not a complete formatted investor publication.
- Not every table number has its own exact People drill-down/comparison chip; all card and primary metric links are implemented, but some supporting counters still use wider cohorts.
- Individual section downloads return their underlying dataset, not dedicated calculated-section CSVs. Full-history dataset counts can differ from period card counts by design.
- Legacy invites lacking first_sent_at use retained email_sent_at/last_sent_at. Resends can make historical first-send intervals unknowable; negative intervals are not presented. Invitation status history does not record every transition date.
- Launch settings/content retained and styled with Reports tokens; not every legacy section has the exact requested header/download convention.
- People retains existing controls; search/stage/activity chips added, but the toolbar does not yet exactly match the requested single row.
- PDF print invoked through browser printing; saved PDF layout, every preset/custom comparison, every chart switch, saved-view round trip, all email/full-history export combinations and production-scale query plans are not fully verified.

## Rollback
Restore prior Reports app files and the previous reports_options/people_rows definitions while preserving the later people-ID filter. Revoke service_role execution of reports_history_snapshot and reports_login_history only after reverting their callers. Never restore broad Admin restrictions, remove history, or alter roles/account flags/two-step settings.
