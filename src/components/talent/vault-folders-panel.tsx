import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight, Folder, Loader2 } from "lucide-react";
import { listPrivateVault, restoreDefaultFolder, deletePrivateFolder } from "@/lib/talent-vault.functions";
import { useTalentVaultCatalogue, subfolderCount, type VaultCategory } from "@/lib/talent-vault-catalogue";
import { friendlyError } from "@/lib/friendly-error";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/shared/use-confirm";

type Folder = { id: string; parent_id: string | null; name: string };

/**
 * Private Vault category switches. Turning a category off only hides it
 * (removed_at) — documents are kept and return when it is switched back on.
 * Agency shared folders are never listed or changed here.
 */
export function VaultFoldersPanel() {
  const qc = useQueryClient();
  const load = useServerFn(listPrivateVault);
  const restore = useServerFn(restoreDefaultFolder);
  const remove = useServerFn(deletePrivateFolder);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const { catalogue, isLoading: catLoading } = useTalentVaultCatalogue();
  const categories = catalogue.categories;

  const { data, isLoading: vaultLoading } = useQuery({
    queryKey: ["talent", "private-vault"],
    queryFn: () => load() as Promise<{ folders: Folder[]; documents: unknown[] }>,
  });
  const isLoading = catLoading || vaultLoading;

  const present = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of data?.folders ?? []) if (!f.parent_id) map.set(f.name, f.id);
    return map;
  }, [data]);

  const onCount = categories.filter((c) => present.has(c.name)).length;
  const allOn = categories.length > 0 && onCount === categories.length;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
    qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
  }

  async function toggle(name: string, on: boolean) {
    setBusy(name);
    try {
      if (on) await restore({ data: { name } });
      else {
        const id = present.get(name);
        if (!id) return;
        await remove({ data: { id } });
      }
      toast.success(on ? `${name} turned on.` : `${name} turned off. Documents inside are kept.`);
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e, "That folder couldn't be changed just now. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function setAll(on: boolean) {
    if (!on) {
      const ok = await confirm({
        title: "Turn all folders off?",
        body: "Every folder will be hidden from your private vault. Any documents inside are kept and come back when you turn the folders on again.",
        confirmLabel: "Turn all off",
      });
      if (!ok) return;
    }
    setBusy("__all");
    try {
      for (const c of categories) {
        const has = present.has(c.name);
        if (on && !has) await restore({ data: { name: c.name } });
        if (!on && has) await remove({ data: { id: present.get(c.name)! } });
      }
      toast.success(on ? "All folders turned on." : "All folders turned off. Documents are kept.");
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e, "Some folders couldn't be changed. Please try again."));
      refresh();
    } finally {
      setBusy(null);
    }
  }

  const subNames = (slug: string) => [
    ...catalogue.subfolders
      .filter((s) => s.category_slug === slug && s.kind === "folder")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.name),
    "Other",
  ];

  const row = (c: VaultCategory) => {
    const on = present.has(c.name);
    const isBusy = busy === c.name || busy === "__all";
    const expanded = open === c.slug;
    const n = subfolderCount(catalogue, c.slug);
    return (
      <li key={c.slug} className="tvf-item">
        <div className="tvf-row">
          <button
            type="button"
            className="tvf-expand"
            aria-expanded={expanded}
            onClick={() => setOpen(expanded ? null : c.slug)}
          >
            <ChevronRight className={`h-4 w-4 tvf-chev${expanded ? " tvf-chev-open" : ""}`} aria-hidden />
            <span className={`tvf-icon tvp-bg-${c.tone}`} aria-hidden>
              <Folder className="h-4 w-4" />
            </span>
            <span className="tvf-text">
              <span className="tvf-name">{c.name}</span>
              <span className="tvf-meta">
                {n} subfolder{n === 1 ? "" : "s"}
              </span>
            </span>
          </button>
          {isBusy ? <Loader2 className="h-4 w-4 tvf-spin animate-spin" aria-label="Saving" /> : null}
          <Switch
            checked={on}
            disabled={busy !== null}
            onCheckedChange={(v) => toggle(c.name, v)}
            aria-label={`${on ? "Turn off" : "Turn on"} ${c.name}`}
          />
        </div>
        {expanded && (
          <ul className="tvf-subs">
            {subNames(c.slug).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const everyday = categories.filter((c) => c.is_starter);
  const more = categories.filter((c) => !c.is_starter);

  return (
    <div className="tvp-card tvp-panel tvf">
      {dialog}
      <div className="tvf-head">
        <div>
          <h2 className="tvp-h2">Manage folders</h2>
          <p className="tvf-desc">
            Choose which folders appear in your private vault. Turning a folder off only hides it — any documents
            inside are kept and come back when you turn it on again.
          </p>
          <p className="tvf-desc">
            This only changes your private vault. Folders shared with an agency are set by the agency.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="tvf-meta">Loading your folders…</p>
      ) : (
        <>
          <div className="tvf-bar">
            <span className="tvf-meta">
              {onCount} of {categories.length} folders on
            </span>
            <button
              type="button"
              className="tvp-link tvf-all"
              disabled={busy !== null || categories.length === 0}
              onClick={() => setAll(!allOn)}
            >
              {allOn ? "Turn all off" : "Turn all on"}
            </button>
          </div>
          {everyday.length > 0 && (
            <>
              <h3 className="tvf-group">Everyday folders</h3>
              <ul className="tvf-grid">{everyday.map(row)}</ul>
            </>
          )}
          {more.length > 0 && (
            <>
              <h3 className="tvf-group">More folders</h3>
              <ul className="tvf-grid">{more.map(row)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
