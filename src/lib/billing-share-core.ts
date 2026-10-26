export function billingLinkReadable(
  link: { status: string; read_until: string | null },
  now = Date.now(),
): boolean {
  return (
    ["active", "needs_review", "read_only", "ended"].includes(link.status) &&
    (link.status === "ended"
      ? !!link.read_until && new Date(link.read_until).getTime() > now
      : !link.read_until || new Date(link.read_until).getTime() > now)
  );
}
export function billingDocumentBelongsToLinks(
  doc: { talent_link_id: string | null; agency_id: string },
  links: readonly { id: string; agency_id: string }[],
): boolean {
  return links.some((link) => doc.talent_link_id === link.id && doc.agency_id === link.agency_id);
}
