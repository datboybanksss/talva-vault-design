<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Product decisions

### Dark mode — deferred (decided)
Dark mode is **intentionally out of scope** for TalVault at this stage. It is a
known future item, not an unresolved question: do not add a theme toggle or
`.dark` overrides without an explicit decision to reverse this.

The design system is already structured to support it without a rework — all
colours/surfaces/shadows live as semantic tokens in `:root` in `src/styles.css`
and the `dark` variant is registered. Adding it later = one `.dark { ... }` token
block plus a toggle. See the note at the top of `src/styles.css`.

## Technical decisions
- All displayed sharing terminology imports the constants in src/lib/terms.ts; legacy identifiers and URLs remain unchanged. Why: consistent sentence case without breaking existing shares.
- Database change history lives only in `supabase/migrations`; a change applied through another tool is copied there as a guarded, no-op-if-present file with rollback SQL in a comment. Why: one history, never re-applied on the live database.
- Every agency talent invitation creates the same agency-visible rows; whether it is really a connection request to an existing account or an inert (never-acceptable) invitation is stored only in `talent_invite_private`, written by service-role functions and unreadable by agency members, and copied onto `agency_talent_links` only when the talent accepts. Why: Agency T&C §6.3 — agencies must not be able to tell whether an account exists.
- Talent post-end read access is decided only by public.talent_link_read_until() (window length in talent_post_end_access_years()); server code and RLS both call it. Why: one rule, one number.
- Agency write access is decided only by public.agency_is_writable() (suspended = read-only); staff reads end at agency_read_only_until(), whose length is post_end_read_only_years() — the same single number talent_post_end_access_years() returns. Server write paths use getWritableCallerAgency/agency_is_writable and RLS uses restrictive "Suspended agency read-only" policies. Why: one rule, enforced in the database as well as the server.
