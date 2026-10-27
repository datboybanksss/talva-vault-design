/** Unsent invitations have no timestamp; never interpret null as the Unix epoch. */
export function invitationDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}
