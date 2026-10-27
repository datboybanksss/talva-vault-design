/** Legacy acceptance records may not have a document reference. */
export function proofDocumentId(id: string | null): string {
  return id?.slice(0, 8) ?? "—";
}
