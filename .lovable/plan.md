# Status and row-action audit — Admin, Agency and Talent portals

Audit only. Nothing changes until this plan is approved. All file paths are under `src/`.

## 1. Every list that shows a status

| Portal | Screen / section | File | Status shown | How the label is made |
|---|---|---|---|---|
| Admin | Dashboard: Agency invitations | routes/admin.index.tsx | agencies.status | Local map |
| Admin | Dashboard: Talent invitations | routes/admin.index.tsx | independent_talent_invitations.status | Map in components/admin/talent-invitation-actions.tsx |
| Admin | Agencies | routes/admin.agencies.index.tsx | agencies.status | Local map (copy of the dashboard map) |
| Admin | Agency detail: header | routes/admin.agencies.$id.tsx | agencies.status | **Raw value** ("accepted") |
| Admin | Agency detail: agency users invited | routes/admin.agencies.$id.tsx | agency_invitations.status | **Raw value** ("pending") |
| Admin | Agency detail: talent invited by this agency | routes/admin.agencies.$id.tsx | talent_invitations.status | **Raw value** |
| Admin | Invitations (agency and talent together) | routes/admin.invitations.index.tsx | agency / independent invitation status | Local map |
| Admin | Administrators and admin invitations | routes/admin.administrators.tsx | user_roles.suspended, admin_invitations.status | Literal "Suspended" plus local map |
| Admin | Talent list | none | none | **No admin talent list exists.** Talent only appear as counts and invitations. |
| Agency | Dashboard: Talent Workspace Overview, plus the recent-talent component | routes/agency.index.tsx | agency_talent_links.status | Shared map in lib/status-labels.ts |
| Agency | Talent roster | routes/agency.talent.index.tsx (EntityCard) | agency_talent_links.status | Shared map |
| Agency | Document Vault talent picker | routes/agency.document-vault.tsx (EntityCard, compact) | agency_talent_links.status | Shared map |
| Agency | Invitations | routes/agency.invitations.tsx | talent_invitations / agency_invitations status | Local map |
| Agency | Active staff | routes/agency.invitations.tsx (ActiveStaffCard) | agency_members.suspended | Literal "Active" / "Suspended" |
| Talent | Trusted contact shares | routes/talent.sharing.tsx | Worked out from revoked_at, is_active, expires_at, locked_at | **Raw lowercase** ("expiring", "locked") |
| Talent | Settings: agency relationship | routes/talent.settings.tsx | agency_talent_links.status | **Raw value** ("read_only"), plain text with no pill |
| Talent | Connection requests | routes/talent.requests.tsx | No status (open requests only) | n/a |
| Talent | Dashboard | routes/talent.index.tsx | Linked or not linked, as a sentence | No list and no actions |

## 2. Status values and how they are displayed

### 2a. Values in the database (live counts as of today)

| Source | Values | Live rows |
|---|---|---|
| agency_talent_links.status (agency_talent_link_status) | active, invited, needs_review, expired, read_only, revoked, ended | active 11, invited 2 |
| agency_talent_links.request_kind | invite, link_request | All visible rows read "invite" (the private kind is in talent_invite_private) |
| agencies.status (agency_status), plus suspended_at | incomplete, invited, accepted, expired, declined, suspended | accepted 8, invited 6 |
| agency_invitations / talent_invitations / independent_talent_invitations (invitation_status) | draft, pending, accepted, expired, declined, revoked | agency: pending 10 / accepted 6 / revoked 1; talent: pending 7 / accepted 10 / revoked 2; independent: 0 |
| admin_invitations.status (plain text, no enum) | pending, accepted, revoked (expired is worked out from the date) | pending 2 / accepted 3 / revoked 4 |
| agency_members | `suspended` true/false and `role` (no status column) | n/a |
| user_roles | `suspended_at` (admins) | n/a |
| loved_one_shares | Worked out: active / expiring / locked / expired / revoked | n/a |

"Expired" on invitations is mostly worked out on screen: `effectiveInvitationStatus` in lib/invitation-status.ts turns a pending invitation past its expiry date into expired. The stored row still says pending.

### 2b. Raw values shown on screen
- Admin agency detail: the header and both invitation tables.
- Talent settings: relationship status (e.g. "read_only").
- Talent trusted contact shares: all five statuses, in lowercase.
- Several screens show the raw value if a status has no label. The roster, dashboard, picker, admin talent invitations and admin invitations all do this.

### 2c. The same status with different labels
| Status | Labels found |
|---|---|
| Invitation pending | "Invited" (admin lists, agency invitations) vs "pending" (admin agency detail) |
| Agency accepted | "Accepted" (admin lists) vs "accepted" (agency detail) |
| Relationship read_only | "Read-only" (agency screens) vs "read_only" (talent settings) |
| Staff / admin active | "Active" pill (agency staff) vs no pill at all (administrators) |

### 2d. Colours compared with the --st-* tokens
- No status pill uses the `--st-*` lifecycle tokens today. `.tvp-status.tvp-<tone>` uses the separate `--tvp-*` palette. Neutral partly uses `--st-neutral-bg`, with muted text.
- **Expired** has two colours: amber for relationships and agencies, red for invitations (agency invitations, admin invitations, independent talent invitations). The token says amber.
- **Draft** is amber on invitation screens. It should be its own colour, either neutral or `--st-incomplete` purple.
- **Declined** is red for agencies but neutral for invitations. The token says red.
- **Revoked** is red for relationships but neutral for invitations. It also has no `--st-*` token.
- **Read-only** and **Suspended** are teal, which matches `--st-suspended` in hue but is not the token.
- **Document Vault picker "Invited" shown amber.** The code maps invited to blue (`TALENT_LINK_STATUS_TONE.invited = "blue"`), and the picker uses that map. The amber shown on the live site is not in today's code. It is probably an older published version or another class winning. First step of the build: inspect the live element's classes and computed colour to confirm.

## 3. Status to actions matrices (as built today)

Server guard key: **W** = writable agency (`getWritableCallerAgency`, which includes `agency_is_writable` and Terms acceptance), **O** = agency owner, **AE** = admin edit permission, **AS** = admin agency-support permission, **T** = talent Terms check.

### 3a. Agency portal

| Screen | Status | Actions offered | Server function | Status rule repeated on the server? |
|---|---|---|---|---|
| Dashboard overview | ended | Open, Reactivate relationship (owner) | reactivateTalentRelationship (W, O) | **No.** Any status can be set to active. |
| Dashboard overview | every status except ended, **including invited, expired and revoked** | Open, Pause relationship (owner) | endTalentRelationship (W, O) | **No.** An invited row can be "paused", which sets it to ended. |
| Dashboard overview | invited | **No Resend, Revoke or Copy link** | n/a | Inconsistent with the Invitations screen |
| Roster | every status | Change talent type | updateTalentLinkTalentType (W) | No status check, no owner check |
| Roster | not ended, expired or revoked | Assign / change manager | setTalentManager (W) | Yes |
| Roster | invited | **No Resend or Revoke; no Pause or Reactivate** | n/a | Inconsistent with the dashboard |
| Document Vault picker | every status | Open folders (no menu) | listAgencyTalentLinksLite (read) | n/a. Invited and revoked links can be opened and show empty folders. |
| Invitations | every status | Copy invite link, Edit and send email (owner) | logAgencyCopyLinkMine (readable, no W) | No status check, so links for accepted or revoked invitations can be copied |
| Invitations | stored pending (also shown when actually expired) | Resend, Revoke (owner) | resendAgencyInvitationMine (W, O, pending); revokeAgencyInvitationMine (W, O) | Resend: yes. Revoke: **no pending check** |
| Invitations | expired / revoked | **No Reinvite** | n/a | Missing |
| Active staff | active, not owner, not self | Make lead / make staff, Remove | updateAgencyStaffRole, removeAgencyStaffMember (W, O) | The server does not repeat the "not suspended" rule |

Dashboard blanks:
- "Type" reads from `agency_talent_links.talent_type`. Gift's link has no type, so it shows "—". It does not fall back to the talent's own profile.
- "Last activity" is the newest shared document, otherwise when the link was last changed. It only goes blank if that date is invalid. Check Gift's link row during the build.

### 3b. Admin portal

| Screen | Status | Actions offered | Server function | Server rule |
|---|---|---|---|---|
| Agencies | invited, invitation in draft | Continue draft, Delete | deleteAgencyInvitation (AE) | Refuses accepted invitations |
| Agencies | invited, invitation sent (**any status, even expired or revoked**) | Preview, Copy, Correct email, Resend, Revoke, Delete | resendInvitation (AS, stored pending), revokeInvitation (AS, **no status check**), updateInvitationEmail (AS, refuses accepted only) | Wider than the combined Invitations list |
| Agencies / agency detail | every status except suspended | Suspend | suspendAgency (AE) | No status check |
| Agencies / agency detail | suspended | Reinstate | unsuspendAgency (AE) | No status check |
| Agency detail invitation tables | every status | **No actions** | n/a | Inconsistent |
| Invitations: agency rows | stored pending | Preview, Copy, Edit email, Resend, Revoke, Delete | As above | Matches the stored status, so expired invitations still show Resend |
| Invitations / dashboard: talent rows | **actually pending only** | Open, Copy, Resend, Revoke | resend/revokeIndependentTalentInvitation (AE, stored pending) | **Opposite rule to agency rows:** expired talent invitations hide Resend, but the server would allow it |
| Invitations | expired / revoked | **No Reinvite** on either type | n/a | Missing |
| Administrators | active / suspended | Edit, Suspend / Restore, Remove (main admin only) | update/setSuspended/removeAdministrator | Yes, except no current-value check on suspend |
| Admin invitations | stored pending | Edit access, Edit email, Resend, Copy, Revoke, Delete | updateAdminInvitation (pending), resendAdminInvitation (pending), revokeAdminInvitation (**no status check**) | Revoke is not checked |

### 3c. Talent portal

| Screen | Status | Actions offered | Server function | Server rule |
|---|---|---|---|---|
| Trusted contact shares | active / expiring / locked | Copy link, New access code, Access history, Revoke access | regenerateAccessCode, revokeLovedOneShare (T, owner) | **No status check:** a new code can be issued on a revoked or expired share |
| Trusted contact shares | expired | Reshare (creates a new share), Access history, Revoke access | createLovedOneShare | Revoking an expired share is pointless |
| Trusted contact shares | revoked | Reshare, Access history | createLovedOneShare | OK |
| Connection requests | open | Accept, Decline | respondToLinkRequest → respond_link_request (T; the database checks expiry and closure) | Yes, in the database |
| Settings / dashboard relationship | any | **None**, raw status text | n/a | No talent-side view of connections; read-only and post-end access are not explained |

## 4. Proposed single source of truth

### 4a. One shared status map (label and colour)
Extend `lib/status-labels.ts` with one entry per status family. Each entry holds the label (sentence case) and a colour on the `--st-*` tokens:

| Family | Status | Label | Colour |
|---|---|---|---|
| Relationship | invited | Invited | --st-invited (blue) |
| | active | Active | --st-accepted (green) |
| | needs_review | Needs review | --st-incomplete (purple) |
| | read_only | Read-only | --st-suspended (teal) |
| | expired | Expired | --st-expired (amber) |
| | revoked | Revoked | --st-declined (red) |
| | ended | Ended | --st-neutral |
| Invitation | draft | Draft | --st-incomplete (purple) |
| | pending (and not expired) | Invited | --st-invited |
| | pending (past expiry) or expired | Expired | --st-expired |
| | accepted | Accepted | --st-accepted |
| | declined | Declined | --st-declined |
| | revoked | Revoked | --st-declined |
| Agency | incomplete / invited / accepted / expired / declined | Incomplete / Invited / Active / Expired / Declined | Matching --st-* token |
| | suspended | Suspended (read-only) | --st-suspended |
| Staff / admin | active / suspended | Active / Suspended | --st-accepted / --st-suspended |
| Trusted contact share | active / expiring / locked / expired / revoked | Active / Expiring soon / Locked / Expired / Revoked | accepted / expired / expired / neutral / declined |

- Add `.tvp-status.st-<name>` pill classes in `styles.css` that use `--st-<name>-bg` and `--st-<name>-fg`.
- Retire the per-screen maps: admin.index, admin.agencies.index, admin.agencies.$id, admin.invitations.index, admin.administrators, agency.invitations and the talent-invitation-actions map.
- An unknown status shows a neutral "Unknown" pill instead of the raw value.

### 4b. One shared allowed-actions map
Add a new file, `lib/status-actions.ts`. It is plain shared logic used by both the screens and the server. For a given row (family, status, expiry, viewer role, whether the agency is writable, the admin's permission level) it returns the allowed action keys. The screens filter `RowActionsMenu` with it. Each server function calls the same helper and refuses actions that are not allowed.

| Family | Status | Agency owner (writable agency) | Agency staff | Admin | Talent |
|---|---|---|---|---|---|
| Relationship | invited (still in date) | Resend invite, Revoke invite, Copy link | Copy link | View only | (Shown in Requests) Accept / Decline |
| Relationship | invited, expired, or revoked | Reinvite (a new invitation through the same neutral flow) | — | View only | — |
| Relationship | active / needs_review | Open, Change type, Assign manager, Pause relationship | Open | View only | View |
| Relationship | read_only / ended | Open (read-only), Reactivate (owner, only before the post-end limit; the talent must accept) | Open | View only | View until `talent_link_read_until()` |
| Agency invitation | draft | — | — | Continue draft, Delete | — |
| Agency / talent / admin invitation | pending, in date | Resend, Revoke, Copy, Edit email | Copy | Resend, Revoke, Copy, Edit email | — |
| Any invitation | expired / revoked / declined | Reinvite | — | Reinvite, Delete | — |
| Any invitation | accepted | — | — | Open the agency, talent or admin record | — |
| Agency | active | — | — | Suspend | — |
| Agency | suspended | All write actions hidden (`agency_is_writable` = false); view only until `agency_read_only_until()` | Same | Reinstate | Unaffected (own 10-year rule) |
| Trusted contact share | active / expiring / locked | — | — | — | Copy link, New access code, Access history, Revoke |
| Trusted contact share | expired / revoked | — | — | — | Reshare, Access history |

How the existing rules are kept:
- **Only an agency connects existing talent.** Admin talent actions only ever create independent invitations, which need ID and proof of talent. There is no admin "Link to agency" action.
- **Agencies cannot tell if a talent account exists (T&C §6.3).** Agency actions are decided only from the agency-visible row: status and expiry. They never use `request_kind`, `talent_invite_private` or `talent_user_id`. Inert invitations offer the same Resend, Revoke and Copy actions. Reinvite goes through the existing neutral invite function.
- **Suspended agencies are read-only.** Every write action is hidden when `agency_is_writable` is false. The server keeps `getWritableCallerAgency`.
- **Talent post-end access.** Read-only and ended relationships show "Open (read-only)" only while `talent_link_read_until()` is in the future, so the screen asks the database rather than repeating the rule.
- **Admin invites.** The existing ID and proof-of-talent gate stays. Reinvite opens a new draft that needs both documents again.

## Technical details (build phase, after approval)

1. Confirm the amber picker colour on the live site (element classes and computed style). Check Gift's link row for the blank type and last activity.
2. Add `--st-*` pill classes, extend `status-labels.ts` with all the families above, and add `status-actions.ts` with unit tests (one per rule).
3. Swap every local map and raw value in the screens listed in section 1 for the shared maps. Talent settings and trusted contact shares get proper pills.
4. Filter every `RowActionsMenu` through `allowedActions`. Add the missing actions:
   - agency dashboard and roster: Resend, Revoke and Copy for invited relationships;
   - Reinvite for expired, revoked and declined invitations on the agency and admin screens;
   - admin agency detail: action menus on its invitation tables.
   Remove "Pause relationship" from invited, expired and revoked rows.
5. Add the server checks that are missing today:
   - endTalentRelationship / reactivateTalentRelationship: allowed prior statuses;
   - revokeAgencyInvitationMine, revokeInvitation, revokeAdminInvitation: pending only;
   - updateInvitationEmail: pending only;
   - regenerateAccessCode: not revoked or expired;
   - updateAgencyStaffRole / removeAgencyStaffMember: target not suspended;
   - suspendAgency / unsuspendAgency: current status;
   - talent invitations: use one expiry rule on the screen and the server.
6. No database schema change is expected. If a Reactivate rule needs a database function, it goes in a guarded `supabase/migrations` file with rollback SQL.
7. Run the type-check, run the existing tests plus the new status-actions tests, and spot-check the Vault picker, roster and admin invitations.

## Decisions needed from you
- Should "Pause relationship" stay as the label for ending a relationship? It sets the status to ended. Would you prefer "End relationship"?
- Should Reactivate need the talent to accept again? I recommend yes, because of consent.
- Draft colour: purple (`--st-incomplete`) or neutral?
