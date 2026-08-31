# Module guides: granular onboarding across all three portals

Today there is one flat tour per portal that spotlights nav items on the current page. This adds a second layer: named **module guides** that walk a real workflow inside a section, can move between pages and tabs mid-guide, auto-play the first time a user opens that module, and are replayable individually from the Help menu.

## 1. What the user gets

- The first time someone opens, say, Quotes & Invoices, a short guide plays: settings first, then creating a quote, then issuing it, then the convert-to-invoice action, then payment status and Reports.
- Each module guide plays once, on its own — seeing the billing guide has no effect on the Vault guide or on the existing portal overview tour.
- The Help icon becomes a grouped list: "Portal overview" at the top, then each module guide by name, each with its own topic checkboxes and its own "Start walkthrough" button.
- Copy stays UK/SA English, and the spotlight/tooltip visuals are unchanged.

## 2. Schema change

One migration, one column:

- `profiles.seen_tours text[] not null default '{}'` — holds tour ids already completed or skipped (e.g. `agency.quotes-invoices`).
- No new table, no new policies: `profiles` already has an owner-scoped update policy and grants, so the client writes its own row as it does for `has_seen_onboarding`.
- `has_seen_onboarding` keeps its current meaning (the portal overview tour) — untouched.

Marking a guide seen appends its id with a de-duplicating update; replay from Help does not clear the array (replay is explicit, so no need to re-arm the auto-play).

## 3. Tour registry restructuring

`src/components/shared/onboarding-tour.tsx` currently holds both the data and the runtime. Split it:

```text
src/lib/tours/types.ts        TourStep, TourGuide, Portal
src/lib/tours/registry.ts     GUIDES: TourGuide[]  (all portals, all modules)
src/lib/tours/index.ts        getOverviewGuide(portal), getModuleGuides(portal),
                              getGuide(id), matchModuleGuides(portal, pathname)
src/components/shared/onboarding-tour.tsx   runtime only (spotlight, measure, nav)
src/components/shared/help-menu.tsx         grouped replay UI
```

Types:

- `TourStep` gains optional `route?: { to: string; search?: Record<string, unknown> }` — navigated to (and awaited) before the step measures its target — plus optional `optional?: boolean` for steps whose target may legitimately be absent (empty tables).
- New `TourGuide = { id: string; portal: Portal; kind: "overview" | "module"; title: string; description: string; match?: string[]; steps: TourStep[] }`. `match` holds route prefixes that trigger the first-visit auto-play.
- `getTourSteps(portal)` stays as a thin wrapper over the overview guide so nothing existing breaks.

Runtime changes in `OnboardingTour`:

- Accepts a guide rather than a portal-keyed array; the portal shells keep rendering `<OnboardingTour portal=... />`, which now resolves overview + matching module guide.
- Before each step, if `step.route` differs from the current location, `navigate(...)`, then wait for the target selector (short polling with a timeout) before measuring. If the target never appears, fall back to today's centred-card behaviour rather than stalling.
- On finish/skip, append the guide id to `seen_tours` (and set `has_seen_onboarding` for the overview guide, as now).
- Auto-play: on mount and on route change, find the highest-priority unseen guide whose `match` covers the current path; the overview tour still wins on a user's very first visit, and a module guide waits until the overview is done.
- `REPLAY_TOUR_EVENT` detail extends to `{ guideId?: string; keys?: string[] }`.

Anchors: steps target existing `data-tour` nav attributes where possible; where a workflow control has no anchor, add a `data-tour="..."` attribute to that element only (e.g. the New Quote button, the convert-to-invoice row action, the Requests tab, the subtab strip). No visual or behavioural change to those components.

## 4. Guide content (grounded in the real screens)

Copy below is the intent per step; final wording is written against the live labels.

**agency.quotes-invoices** (match `/agency/quotes-invoices`, `/agency/settings?tab=quotes-invoices`)
1. Settings first — route to Agency Profile → Quotes & Invoices tab: default acceptance window, reminder cadence, payment terms, overdue grace, VAT registration number and default VAT rate, billing address and logo that appear on documents.
2. Route to Quotes & Invoices, Overview subtab — creating a quote with **New Quote**.
3. Issuing it to a talent or client — the recipient chips and send action.
4. The convert action — an accepted quote converts to an invoice from its own row (the convert icon in the row actions); line items carry over and only the invoice number needs confirming. The "ready to convert" figure on the summary cards points at the same thing.
5. Status and money tracking — the summary row (quoted, invoiced, received, outstanding) and the period selector.
6. The **Reports** subtab — the same period, broken down, with CSV/PDF export.

**agency.document-vault** — Talent → folder → document navigation; upload and where a document lands; the **Requests** tab; raising a **New document request** (talent, folder, title, due date, instructions); reviewing a submission with an outcome, reason and notes visible to the talent; the Needs review / Expiring tabs.

**agency.invitations** — invite talent, choose the folders they receive on acceptance, send, then track status and resend/copy link.

**agency.folders** (Agency Profile → Manage Folders + Document Rules) — Default Folder Selection and Folder Rules; subfolders and default validity rule; then Document Rules: folder retention rules, per-document overrides, expiring-document notice period.

**admin.invitations** — create an agency invitation, edit the invitation email on the preview screen, then send or copy the secure link; expiry and resend.

**admin.agencies** — the agency list, opening an agency, and the activate/suspend flow including the reason recorded in the audit log.

**admin.quotes-invoices** — read-only oversight: figures are aggregated from agencies' own billing and are not editable here.

**talent.vault** — Private Vault versus Agency Shared Folder and who can see each; uploading; pending review.

**talent.sharing** — generate a time-limited link for a loved one, choose what it covers, then share the access code separately from the link.

**talent.settings** — Manage folders (which categories are active), Notifications (reminders and notice period), and where password/2FA live.

## 5. Help menu

Grouped panel: "Portal overview" first, then a section per module guide (title + one-line description from the registry). Each group keeps today's topic checkboxes and Select all/Clear all, and has its own start button that fires `REPLAY_TOUR_EVENT` with that guide id and the selected step keys. Guides already seen are still listed, just not auto-played.

## 6. Build order

1. Migration for `profiles.seen_tours`.
2. `src/lib/tours/*` — types, registry with the overview tours moved across unchanged, helpers.
3. `OnboardingTour` runtime: route-aware steps, target waiting, per-guide seen tracking, auto-play matching.
4. `data-tour` anchors on the workflow controls the guides reference.
5. Module guide content, portal by portal (Agency, then Admin, then Talent).
6. Grouped Help menu.
7. Playwright pass: billing guide plays end to end across tabs, replays per guide, and does not replay after completion.
