export function normaliseInvitationEmail(email: string): string { return email.trim().toLowerCase(); }
export function exactInvitationEmailPattern(email: string): string {
  return normaliseInvitationEmail(email).replace(/([%_\\])/g, "\\$1");
}
export function invitationEmailMatches(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && normaliseInvitationEmail(a) === normaliseInvitationEmail(b);
}