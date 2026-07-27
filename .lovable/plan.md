## Feasibility findings (your questions 1–4)

**1. What AI access actually exists**

You already have a first-class AI gateway wired into this project — no Anthropic key, no connector needed. `LOVABLE_API_KEY` is present as a backend secret, and the Lovable AI Gateway is reachable server-side at `https://ai.gateway.lovable.dev/v1` (OpenAI-compatible). It is billed from your workspace credits, not a third-party account.

Vision/document capability is available: the default model `openai/gpt-5.5` accepts image input **and PDF input** (as a base64 `file` content block) in the same chat request as text. So we do not need a separate OCR step, a PDF-to-image renderer, or a native binary — which matters, because the server runtime here is a Cloudflare-style Worker where `sharp`/`canvas`/`pdftoppm` are not available. Sending the raw PDF/image bytes to the model is the only realistic path, and it's supported.

Practical limits: JPG/PNG/WEBP and PDF work. Office files (DOCX/XLSX) and >~20MB files do not — those fall back to filename/metadata-only suggestion or "no suggestion".

**2. Realistic pipeline**

```text
upload file to storage  ->  server fn: suggestFiling
   |  fetch bytes (service role) -> base64
   |  build catalog of ALLOWED destinations for this actor
   |  one chat call: gpt-5.5, structured JSON output
   v
{ folder, subfolder, confidence, doc_type,
  expiry_date | null, reminder_lead_days | null, rationale }
   ->  popup shows it; nothing is written until the user confirms
```

Key design point: the folder catalog is **passed in as a closed list**, built per-actor from real data — Talent gets their active `talent_private_folders` tree (parent → child), Agency gets that talent's `agency_talent_folders` rows. The model picks from the list only; anything off-list is discarded and treated as "no suggestion". That keeps it aligned with the Manage-folders checklist and blocked/allowed rules already built.

Schema constraints stay flat and bound-free (no `.min()`/enums built from runtime data) to avoid gateway schema errors, with a guarded fallback so a bad response degrades to "no suggestion" rather than crashing the upload.

**3. Cost / latency, sync vs async**

A single-page ID or passport image is a few thousand tokens; a 5-page PDF is meaningfully more. Realistic latency is roughly 3–10 seconds — too long to freeze the upload button, short enough that a separate background job queue is overkill.

Recommendation: **upload completes first, popup opens immediately in a loading state, suggestion streams in when ready.** Concretely:
- File uploads to storage and the row is created with `status = 'ai_suggested'` (Agency) / unfiled (Talent) — the document is never lost if the AI call fails.
- The popup appears right away with skeletons, then fills in.
- The user can hit "Choose different folder" and file manually at any point without waiting.
- Cost control: only run on image/PDF under a size cap, only on first upload (not on every new version unless the folder is unset), and cap pages considered. Failures are silent — the user just files manually.

**4. Shared component + where the placeholder lives**

Confirmed. The "AI Filing Suggestions" card in `src/routes/agency.document-vault.tsx` (~line 425) is exactly the UI-only placeholder you remember — a purple Sparkles card reading "AI filing coming soon." This plan replaces that copy with a live status/history panel and moves the actual interaction into one shared modal used by both portals. The schema already anticipates this: `talent_shared_documents.ai_suggested_folder` and `ai_suggested_expiry` exist and are currently unused, as does the `ai_suggested` document status.

---

## Plan

### A. Shared popup component

New `src/components/shared/ai-filing-review-modal.tsx` — one component, both portals, `tvp-*` tokens, purple/Sparkles accent to match the existing card.

Sections, per your reference design:
1. **Suggested Folder & Subfolder** — primary destination ("Private Vault: Personal → Passport"); for Talent, a secondary context line ("Agency Shared Folder, if shared: Travel → Passport") shown only when the talent is linked to an agency. Actions: `Choose different folder` (swaps in an inline picker over the real allowed-folder list) / `Confirm Folder/Subfolder`.
2. **Suggested Expiry & Reminder** — detected expiry date plus suggested reminder lead time (editable). Actions: `No reminder needed` / `Confirm Expiry & Reminder`.
3. **Human validation required** notice — permanent, styled as an amber callout, reinforcing that nothing is auto-filed.
4. Footer: `Reject AI Suggestion` (files with no AI metadata, user picks manually) / `Save Confirmed Filing` (enabled once both sections are resolved).

States handled: loading skeleton, no-suggestion, unsupported-file-type, error.

### B. Backend

- `src/lib/ai-filing.server.ts` — gateway provider helper + the prompt/catalog builder + guarded structured-output call.
- `src/lib/ai-filing.functions.ts` — `suggestDocumentFiling` (auth-gated, takes storage bucket + path + actor scope, returns the suggestion DTO) and `confirmDocumentFiling` (applies the confirmed folder/expiry/reminder, writes an audit entry).
- Suggestions are **not** persisted before confirmation for Talent; for Agency the existing `ai_suggested_folder` / `ai_suggested_expiry` columns are populated so a half-finished review can be resumed.

### C. Wiring

- **Agency**: `UploadDialog` in `agency.document-vault.tsx` — on successful register, open the shared modal instead of closing straight to the list. Replace the placeholder card copy with a live panel listing documents currently sitting in `ai_suggested` status awaiting review.
- **Talent**: the Private Vault upload path in `talent.vault.tsx` / `talent-vault.functions.ts` — same modal, catalog sourced from the user's active folder tree, confirmation writes `folder_id`, `expires_at`, `reminder_at`.

### D. Verification

Real end-to-end browser test on both portals with a sample passport-style image and a multi-page PDF: confirm the suggestion returns a valid in-catalog folder, an expiry is detected, rejection files cleanly, and a gateway failure degrades to manual filing without losing the upload.

### Assumptions worth correcting if wrong

- Reminder lead time defaults to the portal's existing `expiry_notice_days` setting when the model doesn't suggest one.
- No new schema migration needed for Agency; Talent may need nothing either since `expires_at`/`reminder_at` already exist. I'll confirm during build rather than adding columns speculatively.
- Running only on first upload, not on every new version.
