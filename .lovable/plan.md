# Agency Talent Roster card redesign

## What will change

- Replace the current roster table with a responsive three-column card grid, collapsing cleanly to two and one column on smaller screens.
- Update the page heading to **Talent Roster** with the requested subtitle and keep the Agency notification bell and avatar controls intact.
- Show **Invite Talent** in both requested positions: beside the page heading and in the controls row above the cards.
- Replace the current status tabs with a compact segmented row: **Active (N)**, **Invited (N)**, **Ended (N)** and **All**, calculated from the live roster response.
- Keep search and useful roster filters in a polished controls row so existing roster management remains available.
- Render each talent as a card with their photo when available, otherwise deterministic initials using the existing semantic colour palette.
- Show the live talent name, talent type/category, status, relationship date, and document totals for **Documents**, **Awaiting**, and **Expiring**.
- Preserve the existing permission-aware row action for changing talent type as the shared kebab menu on each card.
- Preserve CSV export and empty/loading states, restyled for the card layout.

## Status and count rules

- **Active** groups live working relationships: `active`, `needs_review`, and `read_only`.
- **Invited** shows `invited` relationships.
- **Ended** groups `ended`, `expired`, and `revoked` relationships.
- **All** shows every roster relationship returned for the agency.
- Card status pills continue to show the relationship’s actual database status rather than replacing it with the tab group label.
- **Awaiting** counts non-revoked shared documents whose live record is pending review, AI-suggested, or marked `needs_review`.
- **Expiring** continues to use the agency’s configured expiry-notice window.
- The relationship creation date is used for **Since** because it is the existing canonical roster start date; invited cards will say **Invited** rather than imply activation.

## Technical details

- Extend the existing roster query to include `talent_user_id`, fetch linked profile `avatar_url` values, and include document `status`, `pending_review`, and `revoked_at` in the existing paged aggregation.
- Add `avatarUrl` and `awaitingDocsCount` to the roster response; do not add tables or migrations.
- Use stable avatar colour selection derived from each talent link ID, with only existing semantic tokens.
- Add roster-specific `tvp-*` classes in the shared stylesheet for the segmented tabs, card grid, avatar, metadata, statistics, hover treatment, and responsive behaviour.
- Give the route complete page metadata while updating it.
- Validate type safety and inspect the live page at desktop and mobile widths when an Agency session is available.
