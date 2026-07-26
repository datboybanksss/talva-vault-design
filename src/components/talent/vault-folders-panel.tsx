import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, FolderPlus } from "lucide-react";
import { listPrivateVault, restoreDefaultFolder } from "@/lib/talent-vault.functions";
import { DEFAULT_CATEGORIES, subfolderCount } from "@/lib/talent-vault-defaults";

type Folder = { id: string; parent_id: string | null; name: string };

export function VaultFoldersPanel() {
  const qc = useQueryClient();
  const load = useServerFn(listPrivateVault);
  const restore = useServerFn(restoreDefaultFolder);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["talent", "private-vault"],
    queryFn: () => load() as Promise<{ folders: Folder[]; documents: unknown[] }>,
  });

  const present = useMemo(() => {
    const set = new Set<string>();
    for (const f of data?.folders ?? []) if (!f.parent_id) set.add(f.name);
    return set;
  }, [data]);

  const missing = DEFAULT_CATEGORIES.filter((c) => !present.has(c.name));

  async function onRestore(name: string) {
    setBusy(name);
    try {
      await restore({ data: { name } });
      toast.success(`"${name}" restored with its recommended subfolders.`);
      qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not restore folder.");
    } finally {
      setBusy(null);
    }
  }

  async function onRestoreAll() {
    setBusy("__all");
    try {
      for (const c of missing) await restore({ data: { name: c.name } });
      toast.success(`${missing.length} folder${missing.length === 1 ? "" : "s"} restored.`);
      qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not restore folders.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tvp-card tvp-panel">
      <div className="tvp-panel-head">
        <div>
          <h2 className="tvp-h2">Default Vault Folders</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Removed a category you didn't need? Restore it here — the full recommended subfolder set
            (including "Other") is re-created fresh.
          </p>
        </div>
        {missing.length > 0 && (
          <button className="tvp-primary" onClick={onRestoreAll} disabled={busy !== null}>
            <FolderPlus className="h-4 w-4" />
            {busy === "__all" ? "Restoring…" : `Restore all (${missing.length})`}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="tvp-muted" style={{ fontSize: 13 }}>Loading your vault…</p>
      ) : (
        <div className="tvp-folder-tree" style={{ marginTop: 14 }}>
          {DEFAULT_CATEGORIES.map((c) => {
            const inVault = present.has(c.name);
            return (
              <div key={c.name} className="tvp-folder-card">
                <div className="tvp-folder-head" style={{ cursor: "default" }}>
                  <span className={`tvp-kpi-icon tvp-bg-${c.tone}`} style={{ width: 40, height: 40 }}>
                    <FolderPlus className="h-4 w-4" />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="tvp-folder-name" style={{ display: "block" }}>{c.name}</span>
                    <span className="tvp-folder-meta" style={{ display: "block" }}>
                      {inVault ? "In my vault" : `Removed · ${subfolderCount(c)} subfolders`}
                    </span>
                  </span>
                  {inVault ? (
                    <CheckCircle2 className="h-4 w-4" style={{ color: "var(--tvp-green)" }} />
                  ) : (
                    <span />
                  )}
                </div>
                {!inVault && (
                  <div style={{ padding: "0 12px 12px" }}>
                    <button
                      className="tvp-secondary"
                      style={{ width: "100%" }}
                      onClick={() => onRestore(c.name)}
                      disabled={busy !== null}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {busy === c.name ? "Restoring…" : `Restore ${c.name}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
