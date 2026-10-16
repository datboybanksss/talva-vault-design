# Automated end-to-end tests

These tests open TalVault in a real browser (Chromium) and check it behaves as a visitor would expect. They run automatically on every change pushed to GitHub, as the **End-to-end tests** job in CI.

## What the tests cover today

Nothing here signs in, and nothing is written to the database.

- **Sign-in page** opens correctly, shows the email and password fields, and logs no errors.
- **Signed-out visitors** who try to open Admin, Talent Manager (agency) or Talent pages, including trusted contact sharing settings, are sent to sign-in.
- **Broken or expired links** for agency, talent and administrator invitations, and for trusted contact shares, show a friendly message instead of crashing.
- **Invitation link format**: `/invite/<code>`, `/invite/talent/<code>` and `/invite/admin/<code>` each open the right activation page.
- **Security headers** are present on pages.
- **Help icon**: it lives in the signed-in portal top bar, so public pages are checked to confirm they have no top bar or Help icon.
- **UK spelling**: public pages are scanned for common American spellings (color, center, license, organization, advisor and others). Any match fails the test.

## Prepared but switched off

These signed-in journeys are written but skipped: sign-in with the emailed code and landing in the right portal, the agency invitation wizard, the admin talent invitation (needs ID and proof of talent before it can be sent), turning an agency quote into an invoice, and creating a trusted contact share link.

**Why they're skipped:** every sign-in needs a two-factor code sent by email. Those emails can't be delivered until the notify.talvault.com sender domain is verified. There is deliberately no test-only way round two-factor sign-in. Once the domain is verified, the codes will be read from a dedicated test inbox and these tests can be switched on with `E2E_AUTH_ENABLED=true`.

## Reading a result

- In GitHub, open the change and look at the **End-to-end tests** check. A green tick means every test passed. A red cross means at least one failed.
- Skipped tests show as skipped. They don't make the run fail.
- For details, open the run and download **playwright-report**. Open `index.html` to see each test. If something failed, **playwright-failures** contains a screenshot and a step-by-step recording of the failing test.

## Running them yourself

```
bun run test:e2e
```

By default the tests start the app on your own machine and test that. To test a deployed staging site instead, set `E2E_BASE_URL`, for example `E2E_BASE_URL=https://staging.example.com bun run test:e2e`. Don't point it at the live site.
