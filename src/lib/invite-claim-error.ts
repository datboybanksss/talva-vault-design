/** Claim failures never disclose database detail, including trigger exceptions. */
export function invitationClaimError(error: { message?: string; code?: string } | null | undefined): string {
  console.error("[invitation-claim] database failure", { code: error?.code, message: error?.message });
  return "We couldn't accept this invitation. Please try again or contact your administrator.";
}