export function shareHasCode(hash: string | null | undefined): boolean { return typeof hash === "string" && hash.trim().length > 0; }
export function privateStoragePathOwned(path: string, owner: string | null): boolean {
  const parts = path.split("/");
  return !!owner && parts[0] === owner && parts.length > 1 && parts.every(p => p !== "" && p !== "." && p !== "..");
}