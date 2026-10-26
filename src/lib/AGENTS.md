# Server authentication
- TVA-SEC-101 is deferred — 2FA owned by the live app; this build preserves legacy password-only access without MFA middleware, restrictive MFA policies or a Data API pre-request guard. Why: build-level emailed codes currently block sign-in.
- MFA flow tables retain service-only INSERT/UPDATE/DELETE; the unused mfa_session_ok helper and nullable mfa_codes.session_id column remain inert. Why: preserve safe write hardening without enforcing build-level 2FA.

# Document AI and onboarding
- Document AI: Parserly is reached only through src/lib/parserly.server.ts (analyseDocument/pollAnalysis); document_ai_analyses is written only by src/lib/document-ai.server.ts with the service role, which checks the requester's own profiles.ai_filing_enabled on the server before any file is sent. Why: one integration point, and a switched-off user's files can never leave TalVault.
- Onboarding duplicate names and blocked-row display use onboarding-documents; service-only insert triggers replace blocked rows atomically and queue old objects, and draft screens retain their staging session. Why: corrected files never erase valid files or hide missing slots.