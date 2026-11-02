/**
 * Folder maths for the talent Private Vault "By folder" view. Pure, so the
 * counting rules can be tested: a category's count includes every document in
 * its subfolders, and a document with no visible folder (never filed, skipped
 * at filing, or in a folder that's been hidden) counts as unfiled so it is
 * always reachable.
 */
export type TreeFolder = { id: string; parent_id: string | null; name: string };
export type TreeDoc = {
  id: string;
  folder_id: string | null;
  pending_review?: boolean | null;
  expires_at?: string | null;
};

export function buildVaultTree<F extends TreeFolder, D extends TreeDoc>(
  folders: F[],
  documents: D[],
) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const children = new Map<string, F[]>();
  for (const f of folders) {
    if (!f.parent_id || !byId.has(f.parent_id)) continue;
    children.set(f.parent_id, [...(children.get(f.parent_id) ?? []), f]);
  }
  const categories = folders.filter((f) => !f.parent_id || !byId.has(f.parent_id));

  const descendants = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift() as string;
      for (const c of children.get(cur) ?? []) {
        if (out.has(c.id)) continue;
        out.add(c.id);
        queue.push(c.id);
      }
    }
    return out;
  };

  const isUnfiled = (d: D) => !d.folder_id || !byId.has(d.folder_id);
  const docsIn = (id: string) => {
    const scope = descendants(id);
    return documents.filter((d) => d.folder_id != null && scope.has(d.folder_id));
  };
  const directDocs = (id: string) => documents.filter((d) => d.folder_id === id);
  const unfiled = documents.filter(isUnfiled);

  /** "Contracts and deals › Brand deals" for a folder, or null when unfiled. */
  const pathOf = (folderId: string | null): string | null => {
    if (!folderId || !byId.has(folderId)) return null;
    const names: string[] = [];
    let cur: F | undefined = byId.get(folderId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return names.join(" › ");
  };

  /** The top-level category a folder sits under. */
  const categoryOf = (folderId: string): F | undefined => {
    let cur = byId.get(folderId);
    const seen = new Set<string>();
    while (cur?.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent_id);
    }
    return cur;
  };

  return {
    byId,
    categories,
    childrenOf: (id: string) => children.get(id) ?? [],
    descendants,
    docsIn,
    directDocs,
    unfiled,
    isUnfiled,
    pathOf,
    categoryOf,
  };
}

/** Expires within the talent's notice window (and hasn't already expired). */
export function expiresSoon(
  expiresAt: string | null | undefined,
  noticeDays: number,
  now = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t >= now && t - now <= noticeDays * 86_400_000;
}

/** Needs filing = still awaiting the filing review, or not in any visible folder. */
export function needsFiling(doc: TreeDoc, unfiled: boolean): boolean {
  return unfiled || !!doc.pending_review;
}
