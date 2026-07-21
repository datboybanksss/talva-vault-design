import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Folder, Plus, Save, Info, Trash2, Pencil, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import {
  listAgencyFolderTemplates,
  upsertAgencyFolderTemplate,
  deleteAgencyFolderTemplate,
  applyAgencyFolderTemplate,
  agencyWhoami,
} from "@/lib/agency.functions";

type Template = { id: string; name: string; description: string | null; is_default: boolean; created_at: string; updated_at: string };
type Item = { id: string; template_id: string; folder_name: string; sort_order: number; default_retention_years: number | null };

const listQO = queryOptions({
  queryKey: ["agency", "folder-templates"],
  queryFn: () => listAgencyFolderTemplates() as Promise<{ role: string; templates: Template[]; items: Item[] }>,
});
const meQO = queryOptions({
  queryKey: ["agency", "whoami"],
  queryFn: () => agencyWhoami(),
});

export const Route = createFileRoute("/agency/folder-templates")({
  head: () => ({ meta: [{ title: "Folder Templates · TalVault" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(listQO),
      context.queryClient.ensureQueryData(meQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Folder Templates</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: FolderTemplatesPage,
});

type EditorItem = { key: string; id?: string; folder_name: string; sort_order: number; default_retention_years: number | null };

function FolderTemplatesPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(listQO);
  const { data: me } = useSuspenseQuery(meQO);
  const isOwner = me?.role === "owner";

  const upsertFn = useServerFn(upsertAgencyFolderTemplate);
  const deleteFn = useServerFn(deleteAgencyFolderTemplate);
  const applyFn = useServerFn(applyAgencyFolderTemplate);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [items, setItems] = useState<EditorItem[]>([]);

  const itemsByTemplate = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of data.items) {
      const list = map.get(it.template_id) ?? [];
      list.push(it);
      map.set(it.template_id, list);
    }
    return map;
  }, [data.items]);

  const totalItems = data.items.length;
  const distinctFolders = new Set(data.items.map((i) => i.folder_name)).size;
  const withRetention = data.items.filter((i) => (i.default_retention_years ?? 0) > 0).length;

  function openNew() {
    setEditingId(null);
    setName("");
    setDescription("");
    setIsDefault(false);
    setItems([{ key: crypto.randomUUID(), folder_name: "", sort_order: 0, default_retention_years: null }]);
    setEditorOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description ?? "");
    setIsDefault(t.is_default);
    const its = (itemsByTemplate.get(t.id) ?? []).map((i) => ({
      key: i.id,
      id: i.id,
      folder_name: i.folder_name,
      sort_order: i.sort_order,
      default_retention_years: i.default_retention_years,
    }));
    setItems(its.length ? its : [{ key: crypto.randomUUID(), folder_name: "", sort_order: 0, default_retention_years: null }]);
    setEditorOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const cleanItems = items
        .filter((i) => i.folder_name.trim().length > 0)
        .map((i, idx) => ({
          id: i.id,
          folder_name: i.folder_name.trim(),
          sort_order: idx,
          default_retention_years: i.default_retention_years ?? null,
        }));
      if (!cleanItems.length) throw new Error("Add at least one folder");
      return upsertFn({
        data: {
          id: editingId ?? undefined,
          name: name.trim(),
          description: description.trim() || null,
          is_default: isDefault,
          items: cleanItems,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "folder-templates"] });
      toast.success(editingId ? "Template updated" : "Template created");
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "folder-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const apply = useMutation({
    mutationFn: (id: string) => applyFn({ data: { template_id: id } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["agency", "retention", "rules"] });
      toast.success(`Template applied · ${res?.rules_created ?? 0} retention rule(s) created`);
    },
    onError: (e: any) => toast.error(e.message ?? "Apply failed"),
  });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Folder Templates</h1>
          <div className="tvp-subtitle">Reusable folder sets that seed retention rules when applied.</div>
        </div>
        <div className="tvp-actions">
          {isOwner && (
            <button className="tvp-primary" onClick={openNew}><Plus className="h-4 w-4" />New Template</button>
          )}
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>How folder templates work.</strong> Owners define reusable folder sets and per-folder default retention (in years). Applying a template creates or updates matching folder-scope retention rules for this agency.
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-teal"><Folder className="h-5 w-5" /></div><div><div className="tvp-kpi-value">{data.templates.length}</div><div className="tvp-kpi-label">Templates</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-purple"><Plus className="h-5 w-5" /></div><div><div className="tvp-kpi-value">{totalItems}</div><div className="tvp-kpi-label">Total Folder Entries</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-green"><Folder className="h-5 w-5" /></div><div><div className="tvp-kpi-value">{distinctFolders}</div><div className="tvp-kpi-label">Distinct Folders</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-blue"><Folder className="h-5 w-5" /></div><div><div className="tvp-kpi-value">{withRetention}</div><div className="tvp-kpi-label">With Retention</div></div></div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Templates</h2>
        </div>
        {data.templates.length === 0 ? (
          <p className="tvp-muted" style={{ padding: 16 }}>
            No templates yet.{isOwner ? " Click New Template to create one." : " Only owners can create templates."}
          </p>
        ) : (
          <table className="tvp-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Name</th><th>Description</th><th>Folders</th><th>Default retentions</th><th>Default?</th><th></th></tr></thead>
            <tbody>
              {data.templates.map((t) => {
                const its = itemsByTemplate.get(t.id) ?? [];
                const withR = its.filter((i) => (i.default_retention_years ?? 0) > 0).length;
                return (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td className="tvp-muted">{t.description ?? "—"}</td>
                    <td>{its.length}</td>
                    <td>{withR} of {its.length}</td>
                    <td>{t.is_default ? <span className="tvp-status tvp-green">Default</span> : <span className="tvp-status tvp-neutral">—</span>}</td>
                    <td>
                      <div className="flex gap-2">
                        {isOwner && (
                          <>
                            <button className="tvp-mini-btn" title="Edit" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></button>
                            <button className="tvp-mini-btn" title="Apply template (creates retention rules)" onClick={() => apply.mutate(t.id)} disabled={apply.isPending}><PlayCircle className="h-4 w-4" /></button>
                            <button className="tvp-mini-btn" title="Delete" onClick={() => { if (confirm(`Delete template "${t.name}"?`)) del.mutate(t.id); }}><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editorOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditorOpen(false)}>
          <div className="tvp-card" style={{ maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <h2 className="tvp-h2">{editingId ? "Edit template" : "New template"}</h2>
              <button className="tvp-mini-btn" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="tvp-form-group">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard onboarding folders" />
            </div>
            <div className="tvp-form-group">
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div className="tvp-form-group">
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                Mark as default template
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                <strong>Folders</strong>
                <button className="tvp-secondary" onClick={() => setItems([...items, { key: crypto.randomUUID(), folder_name: "", sort_order: items.length, default_retention_years: null }])}>
                  <Plus className="h-4 w-4" />Add folder
                </button>
              </div>
              <table className="tvp-table">
                <thead><tr><th>Folder name</th><th style={{ width: 160 }}>Retention (years)</th><th style={{ width: 40 }}></th></tr></thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.key}>
                      <td>
                        <input value={it.folder_name} placeholder="e.g. Contracts" onChange={(e) => {
                          const copy = [...items]; copy[idx] = { ...it, folder_name: e.target.value }; setItems(copy);
                        }} />
                      </td>
                      <td>
                        <input type="number" min={0} max={100} value={it.default_retention_years ?? ""} placeholder="—" onChange={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          const copy = [...items]; copy[idx] = { ...it, default_retention_years: v }; setItems(copy);
                        }} />
                      </td>
                      <td>
                        <button className="tvp-mini-btn" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
              <button className="tvp-secondary" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="tvp-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
