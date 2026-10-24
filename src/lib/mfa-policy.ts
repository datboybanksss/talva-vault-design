/** Compile-time function identity only; never trust request input for exemptions. */
export const MFA_REQUIRED = "MFA_REQUIRED";
export const MFA_BOOTSTRAP_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  "src/lib/mfa.functions.ts": [
    "getMfaStatus", "markMfaExplainerSeen", "requestSignInCode", "verifySignInCode", "beginSignInChallenge",
  ],
  "src/lib/invite-claim.functions.ts": ["inviteAccountStatus", "pendingInvitationForMe"],
  "src/lib/agency-activation.functions.ts": ["resolveAgencyInvitationToken", "activateAgencyInvitation"],
  "src/lib/talent-activation.functions.ts": ["resolveTalentInvitationToken", "activateTalentInvitation"],
  "src/lib/admin-activation.functions.ts": ["resolveAdminInvitationToken", "activateAdminInvitation"],
  "src/lib/legal.functions.ts": ["getCurrentLegalDocument"],
  "src/lib/loved-one.functions.ts": ["unlockLovedOneShare", "getLovedOneShareByToken", "getLovedOneFileUrl"],
};

export function isMfaBootstrap(meta: { filename: string; name: string }): boolean {
  // Compiler filenames can be absolute during development.
  const filename = meta.filename.replace(/\\/g, "/");
  return Object.entries(MFA_BOOTSTRAP_FUNCTIONS).some(([file, names]) =>
    (filename === file || filename.endsWith(`/${file}`)) && names.includes(meta.name),
  );
}

export function verifiedSessionId(claims: Record<string, unknown>): string | null {
  const id = claims.session_id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

export function isMfaRequired(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(MFA_REQUIRED);
}