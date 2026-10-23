# Terms gate: "We couldn't verify this Terms document" (Agency): assessment and proposed fix

Assessment only. No code or data has been changed.

## What I checked

**Terms documents (point 2): both are healthy.**
| Portal | Version | Current | ID valid | Hash format | Hash matches text |
|---|---|---|---|---|---|
| Agency | v1.1 | yes (only one) | yes | 64 lowercase hex | yes |
| Talent | v1.1 | yes (only one) | yes | 64 lowercase hex | yes |

**Database step (point 3): it doesn't reject agency users.**
- The stamping step needs only a document and a method. It fills in the agency and role from membership and doesn't look at agency status, so an agency at "invited" isn't refused.
- The limits on the table are: type agency or talent, method activation or re-acceptance, a known role, and one acceptance per user per version. None of these would refuse a first acceptance.
- If the database did refuse, the message wouldn't contain the trigger words. The screen would show "We couldn't record your acceptance".

**The product owner's accounts (point 1, read-only, nothing accepted):**
- laranel194@gmail.com (owner of agency "Test", status "invited", not Test): **already accepted agency v1.1 on 22 Oct 2026.** On the current code the gate shouldn't appear for this account at all.
- laranel@outlook.com (owner of agency "Lara", also an Administrator, not Test): **has no acceptance on record.** This is most likely the account that is stuck.
- The QA Test Agency owner and staff both accepted v1.1 through the same screen today without an error.

**Server code:** the current gate sends the document ID and hash exactly as the server returned them. The server then checks them against the current row. Given the data above, the current code can't produce a validation error.

**Logs:** there are no server or database log entries for Terms in the last hour or the last three days. The failing attempt wasn't captured, so **the real error behind the message isn't confirmed yet.**

**Live site vs preview (point 4):** not confirmed. The Terms screen loads in a separate piece of the live site that I couldn't read in this mode. The likeliest explanation is still that the live site runs an older build, where the gate sent a version label instead of the document ID. The QA accounts accepted in the preview, not on the live site.

## Likely cause (unconfirmed)
1. The most likely cause is that the live site is behind the preview and sends an old value, which fails the strict ID check. That error text contains "invalid_string", so the screen shows "couldn't verify".
2. The other possibility is an error specific to laranel@outlook.com being an Administrator as well as an agency owner. The over-broad message would hide that too.

**Who is affected:** anyone who hasn't yet accepted, on the live site. If cause 1 is right, that's talent as well as agency, because both use the same screen. Users who accepted before the change aren't affected.

## Proposed fix (for approval)
1. **Find the real error first.** Reproduce on the live site with a fresh Test agency owner, capturing the exact request and response. Add server-side logging of the real error in the acceptance step, recording the error type and a short code only, never personal data.
2. **Narrow `termsGateError`:**
   - Show "couldn't verify this Terms document" only for a genuine input failure, meaning a validation error on the `document_id` or `body_sha256` field. The server should return this as a plain, known sentence rather than raw validation text.
   - Keep the existing "These Terms have been updated…" message, and fetch the current Terms again automatically.
   - For everything else, show "We couldn't record your acceptance. Please try again." and log the real cause on the server.
3. **Republish,** so the live site matches the preview. Then re-test acceptance on the live site with Test accounts only: an agency owner, agency staff, a linked talent and an independent talent.
4. **If cause 2 is confirmed** (Administrator plus agency owner), fix that path so these accounts can accept their agency Terms normally.
5. **Tests:**
   - Only true ID or hash problems produce the "verify" message.
   - Database and unknown errors produce the "record" message.
   - An agency owner whose agency is still "invited" can accept.

## Technical notes
- The trigger words in `termsGateError` (`document_id`, `body_sha256`, `"code":`) also match Postgres messages such as "document_id is required" and any JSON error. That is why it's too broad.
- Changes will be in `src/lib/terms-gate-core.ts`, `src/lib/terms-acceptance.functions.ts` (the input check returns a plain message, plus logging) and `src/components/shared/terms-gate.tsx` (fetch again on "updated"), with tests in `terms-gate-core.test.ts`.
- No Terms acceptance on any non-Test account.
