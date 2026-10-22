# Audit: ID validation and raw-error family (all portals)

Audit only. No code changed. Fixes below await approval.

## Headline findings
- 90 strict `uuid()` validators across 11 server-function modules. None of the paths sampled sends a blank ID by mistake, but no server function turns a validation failure into a friendly message — any slip returns raw Zod JSON.
- 116 places show the raw error text straight to the user (`toast.error(e.message)`) across 37 files. This affects every portal. The Terms gate is the only screen that turns errors into friendly messages.
- Both activation wizards (agency and talent) can send an empty Terms version when the Terms text has not loaded, and they cache the Terms document indefinitely.
- Cause of the T&C error (7): **not proven**. The live IDs are valid, and the current gate sends `doc.id` from the server response. The most likely cause is an older published build (an older gate that sent another value). I cannot read the published deploy time, so this is unverified.

## Findings by portal

### Shared (all signed-in portals)
| File / function | Check | What the user would see | Severity | Proposed fix |
|---|---|---|---|---|
| All server functions with `inputValidator(...parse)` | 1, 5 | A JSON blob such as `[{"validation":"uuid"...}]` whenever any input is wrong | High | One shared `friendlyError()` helper (extend `termsGateError`) used by every toast; server validators throw a plain sentence instead of Zod JSON |
| 116 `toast.error(e.message)` call sites (37 files) | 5 | Database or technical text, e.g. "violates row-level security", "TERMS_NOT_ACCEPTED: …", "Forbidden" | High | Route all through the shared helper; keep known plain messages, replace the rest with "Something went wrong. Please try again." |
| `terms-gate.tsx` status query (`staleTime` 60 s) | 3 | Low risk now: the server re-checks ID and hash and shows "These Terms have been updated…" | Low | Refetch the current document after that message instead of asking the user to reload |
| `ai-filing-review-modal.tsx` (`staleTime: Infinity`) | 3 | Folder list can be out of date if folders change while the popup is open; saving to a deleted folder fails with raw text | Medium | Refetch folders on open; friendly error |
| `use-analyse-with-ai.ts`, `ai-filing-preference-card.tsx` | 5 | Raw error on toggle/analyse failure | Low | Shared helper |

### Agency portal
| File / function | Check | What the user would see | Severity | Proposed fix |
|---|---|---|---|---|
| `invite.$token.tsx` activation → `agency-activation` `terms_version` | 1, 4, 3 | If Terms text hasn't loaded, "Complete" sends `""` → raw "String must contain at least 1 character(s)"; cached Terms (`staleTime: Infinity`) can be an old version | High | Disable the button until Terms loaded; send the document ID and hash (as the gate does), not the version label; refetch before submit |
| `agency.quotes-invoices.tsx` (9 raw toasts) | 5 | Raw database/trigger text e.g. locked-invoice errors | Medium | Shared helper |
| `agency.document-vault.tsx` (7), `manage-folders-panel`, `folder-templates-panel`, `document-rules-panel`, `vault-requests-panel` | 5 | Raw text on upload/move/delete failures, including suspended-agency refusals | Medium | Shared helper with a read-only message |
| `agency.invitations.tsx` (5), `talent-link-actions.tsx` (4), `agency.talent.index.tsx` | 5 | Raw text on invite/link actions | Medium | Shared helper |
| `clients-panel.tsx` manager field | 2 | Checked: `""` is converted to `null` before sending — no bug | — | None |
| `agency-profile-panel`, `billing-sender-card`, `invoice-payments-dialog`, `clients-panel`, `quotes-invoices-settings-panel`, `agency.contracts.$id`, `agency.my-account` | 5 | Raw text on save failure | Low | Shared helper |

### Talent portal
| File / function | Check | What the user would see | Severity | Proposed fix |
|---|---|---|---|---|
| `invite.talent.$token.tsx` activation → `talent-activation` `terms_version` | 1, 3, 4 | Same as agency: empty or outdated Terms version → raw validation error or acceptance of an older version | High | Same as agency activation |
| `talent.vault.tsx` (7), `vault-folders-panel` | 5 | Raw text on upload/filing/delete | Medium | Shared helper |
| `talent.sharing.tsx` (3) — Trusted contact shares | 5, 6 | Raw text on create/revoke share | Medium | Shared helper |
| `talent.settings.tsx`, `talent.notifications.tsx`, `talent.requests.tsx`, `talent.index.tsx` | 5 | Raw text, including "TERMS_NOT_ACCEPTED: …" if the gate is bypassed | Low | Shared helper maps this code to "Please accept the current Terms & Conditions to continue." |

### Admin portal
| File / function | Check | What the user would see | Severity | Proposed fix |
|---|---|---|---|---|
| `admin.administrators.tsx` (8), `admin.agencies.index.tsx` (6), `admin.agencies.$id.tsx` | 5 | Raw text on invite/suspend/permission changes | Medium | Shared helper |
| `talent-invite-form.tsx` (8), `admin.invitations.new.tsx` (4), `admin.invitations.index.tsx` (4), `talent-invitation-actions.tsx` (3) | 5, 4 | Raw text on draft save/upload/send; Send can fire before a new draft's ID exists | Medium | Shared helper; disable Send until the draft is saved and has an ID |
| `invite.admin.$token.tsx` (`staleTime` 30 s) | 3 | Low: the token is re-checked on the server | Low | None beyond the shared helper |
| `admin.my-account.tsx`, `admin.administrators.$id.email-preview.tsx` | 5 | Raw text | Low | Shared helper |

### Trusted contact (no account)
| File / function | Check | What the user would see | Severity | Proposed fix |
|---|---|---|---|---|
| `loved-one.$token.tsx` open document | 5 | Raw server text when a file fails to open (expired/revoked link) | Medium | Plain "This document is no longer available." message |

## What I could not verify
- Every one of the 90 `uuid()` call sites was not traced by hand. I checked the Terms, activation and client-form paths and sampled the rest. The first step of the fix is a full trace of every call site (table of file → server function → where the ID comes from).
- Whether the published site is behind the current build (7). I can't read the published deploy time here. The current code cannot send a non-ID for `document_id`. Republishing and re-testing as an agency owner would confirm it.
- Real signed-in agency, talent and Trusted contact click-throughs (the available session opens Admin only).

## Proposed fix order (for approval)
1. Trace every `uuid()` call site in full, then fix any that can send blank, label or unloaded IDs.
2. Add a shared friendly-error helper and replace all 116 raw toasts with it. Make server validators return plain sentences.
3. Activation wizards: disable submit until Terms load, send the Terms document ID and hash, and refetch before submitting.
4. Add loading/disabled guards to admin draft Send and the filing popup Save; refetch the filing popup's folders on open.
5. Republish, then re-test Terms acceptance as agency owner, agency staff and talent.
6. Add tests: the helper never shows JSON or codes; activation refuses to submit with an empty Terms value.
