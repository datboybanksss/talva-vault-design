export function shareHasCode(hash: string | null | undefined): boolean { return typeof hash === "string" && hash.trim().length > 0; }
export function privateStoragePathOwned(path: string, owner: string | null): boolean {
  const parts = path.split("/");
  return !!owner && parts[0] === owner && parts.length > 1 && parts.every(p => p !== "" && p !== "." && p !== "..");
}
export function privateFolderOwned(folder: { user_id: string; removed_at: string | null } | null, caller: string): boolean {
  return folder?.user_id === caller && folder.removed_at === null;
}