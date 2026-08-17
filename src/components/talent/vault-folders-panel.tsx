import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderPlus } from "lucide-react";
import {
  listPrivateVault,
  restoreDefaultFolder,
  deletePrivateFolder,
} from "@/lib/talent-vault.functions";
import { DEFAULT_CATEGORIES, subfolderCount } from "@/lib/talent-vault-defaults";

type Folder = { id: string; parent_id: string | null; name: string };

export function VaultFoldersPanel() {
  const qc = useQueryClient();
  const load = useServerFn(listPrivateVault);
  const restore = useServerFn(restoreDefaultFolder);
  const remove = useServerFn(deletePrivateFolder);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["talent", "private-vault"],
    queryFn: () => load() as Promise<{ folders: Folder[]; documents: unknown[] }>,
  });

  const present = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of data?.folders ?? []) if (!f.parent_id) map.set(f.name, f.id);
    return map;
  }, [data]);

  const activeCount = DEFAULT_CATEGORIES.filter((c) => present.has(c.name)).length;

  async function toggle(name: string, on: boolean) {
    setBusy(name);
    try {
      if (on) {
        await restore({ data: { name } });
        toast.success(`"${name}" is now active with its recommended subfolders.`);
      } else {
        const id = present.get(name);
        if (!id) return;
        await remove({ data: { id } });
        toast.success(`"${name}" hidden from your vault — turn it back on any time.`);
      }
      qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
      qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update folder.");
    } finally {
      setBusy(null);
    }
  }

  async function setAll(on: boolean) {
    setBusy("__all");
    try {
      for (const c of DEFAULT_CATEGORIES) {
        const has = present.has(c.name);
        if (on && !has) await restore({ data: { name: c.name } });
        if (!on && has) await remove({ data: { id: present.get(c.name)! } });
      }
      toast.success(on ? "All categories activated." : "All categories hidden.");
      qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
      qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update folders.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tvp-card tvp-panel">
      <div className="tvp-panel-head">
        <div>
          <h2 className="tvp-h2">Manage folders</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
            New vaults start with {STARTER_CATEGORIES.length} everyday categories. Switch on any of
            the other {DEFAULT_CATEGORIES.length - STARTER_CATEGORIES.length} whenever you need
            them — turning one on provisions its full subfolder set; turning it off hides it
            (documents are kept and return if you switch it back on).
          </p>
        </div>
        <div className="tvp-row-actions">
          <button className="tvp-secondary" onClick={() => setAll(false)} disabled={busy !== null || activeCount === 0}>
            Deselect all
          </button>
          <button className="tvp-primary" onClick={() => setAll(true)} disabled={busy !== null || activeCount === DEFAULT_CATEGORIES.length}>
            <FolderPlus className="h-4 w-4" /> Select all
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="tvp-muted" style={{ fontSize: 13 }}>Loading your vault…</p>
      ) : (
        <>
          <p className="tvp-muted" style={{ fontSize: 12, margin: "6px 0 12px" }}>
            {activeCount} of {DEFAULT_CATEGORIES.length} categories active
          </p>
          <div className="tvp-folder-tree">
            {DEFAULT_CATEGORIES.map((c) => {
              const active = present.has(c.name);
              const isBusy = busy === c.name || busy === "__all";
              return (
                <label
                  key={c.name}
                  className="tvp-folder-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    cursor: isBusy ? "progress" : "pointer",
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={busy !== null}
                    onChange={(e) => toggle(c.name, e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "var(--tvp-teal)" }}
                  />
                  <span className={`tvp-kpi-icon tvp-bg-${c.tone}`} style={{ width: 36, height: 36 }}>
                    <FolderPlus className="h-4 w-4" />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="tvp-folder-name" style={{ display: "block" }}>{c.name}</span>
                    <span className="tvp-folder-meta" style={{ display: "block" }}>
                      {subfolderCount(c)} subfolders · {active ? "Active" : "Hidden"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
