import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentDashboard } from "@/lib/talent.functions";
import {
  getRosterSharedContents,
  getSharedDocumentDownloadUrl,
  listTalentDocumentRequests,
  createTalentRequestUploadUrl,
  submitTalentDocumentRequest,
} from "@/lib/talent.functions";
import {
  listPrivateVault,
  createPrivateFolder,
  deletePrivateFolder,
  createPrivateUploadUrl,
  getPrivateDocumentDownloadUrl,
  deletePrivateDocument,
} from "@/lib/talent-vault.functions";
import { toast } from "sonner";
import {
  Plus, Upload, Lock, FileStack, Sparkles, Info, Download, FolderOpen,
  Folder, Trash2, MoreVertical, Inbox, AlertCircle, CheckCircle2, Clock as ClockIcon,
  ChevronDown, Search, ArrowRight,
} from "lucide-react";


export const Route = createFileRoute("/talent/vault")({
  head: () => ({ meta: [{ title: "Vault · TalVault Talent" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: Mode } => {
    const t = search.tab;
    return t === "private" || t === "agency" || t === "requests" ? { tab: t } : {};
  },
  component: VaultPage,
});


type Mode = "private" | "agency" | "requests";

function VaultPage() {
  const { tab } = useSearch({ from: "/talent/vault" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(tab ?? "private");

  useEffect(() => {
    if (tab && tab !== mode) setMode(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const goTo = (next: Mode) => {
    setMode(next);
    navigate({ to: "/talent/vault", search: { tab: next }, replace: true });
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Vault</h1>
          <div className="tvp-subtitle">
            One vault area with clear separation between Private Vault, Agency Shared Folder and Manager Requests.
          </div>
        </div>
      </div>

      <div className="tvp-tabs">
        <button className={`tvp-tab${mode === "private" ? " tvp-active" : ""}`} onClick={() => goTo("private")}>
          <Lock className="h-4 w-4" /> Private Vault
        </button>
        <button className={`tvp-tab${mode === "agency" ? " tvp-active" : ""}`} onClick={() => goTo("agency")}>
          <FileStack className="h-4 w-4" /> Agency Shared Folder
        </button>
        <button className={`tvp-tab${mode === "requests" ? " tvp-active" : ""}`} onClick={() => goTo("requests")}>
          <Inbox className="h-4 w-4" /> Manager Requests
        </button>
      </div>

      {mode === "private" && <PrivateVault />}

      {mode === "agency" && <AgencySharedFolder onOpenRequests={() => goTo("requests")} />}

      {mode === "requests" && <ManagerRequests />}



    </>
  );
}

type PrivateFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  tone: string | null;
  sort_order: number;
  created_at: string;
};
type PrivateDoc = {
  id: string;
  folder_id: string | null;
  name: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  reminder_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function PrivateVault() {
  const qc = useQueryClient();
  const load = useServerFn(listPrivateVault);
  const createFolder = useServerFn(createPrivateFolder);
  const deleteFolder = useServerFn(deletePrivateFolder);
  const createUpload = useServerFn(createPrivateUploadUrl);
  const download = useServerFn(getPrivateDocumentDownloadUrl);
  const deleteDoc = useServerFn(deletePrivateDocument);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterFolder, setFilterFolder] = useState<string>("__all");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const toggleFolder = (id: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });


  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "private-vault"],
    queryFn: () => load() as Promise<{ folders: PrivateFolder[]; documents: PrivateDoc[] }>,
  });

  const folders = data?.folders ?? [];
  const documents = data?.documents ?? [];
  const topFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);
  const subsByParent = useMemo(() => {
    const map = new Map<string, PrivateFolder[]>();
    for (const f of folders) {
      if (!f.parent_id) continue;
      const arr = map.get(f.parent_id) ?? [];
      arr.push(f);
      map.set(f.parent_id, arr);
    }
    return map;
  }, [folders]);
  const folderName = (id: string | null) =>
    id ? folders.find((f) => f.id === id)?.name ?? "—" : "Unfiled";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });

  async function onAddTopFolder() {
    const name = window.prompt("New folder name")?.trim();
    if (!name) return;
    try {
      await createFolder({ data: { name } });
      toast.success("Folder created.");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create folder.");
    }
  }




  async function onDeleteFolder(id: string, name: string, isTop: boolean) {
    const message = isTop
      ? `Remove "${name}" from your vault? It will be hidden, and you can restore it later from Settings → Vault Folders with its documents intact.`
      : `Delete "${name}"? Only empty subfolders can be deleted.`;
    if (!window.confirm(message)) return;
    try {
      await deleteFolder({ data: { id } });
      toast.success(isTop ? "Folder removed — restore it any time from Settings." : "Folder deleted.");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete.");
    }
  }

  function triggerUpload(folderId: string | null) {
    setUploadFolderId(folderId);
    fileInput.current?.click();
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Max upload size is 50 MB.");
      return;
    }
    try {
      const { upload } = await createUpload({
        data: {
          file_name: file.name,
          folder_id: uploadFolderId,
          mime_type: file.type || null,
          size_bytes: file.size,
        },
      });
      const put = await fetch(upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      toast.success("Document uploaded.");
      invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    }
  }

  async function onDownload(id: string) {
    try {
      const { url } = await download({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open file.");
    }
  }

  async function onDeleteDoc(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await deleteDoc({ data: { id } });
      toast.success("Document deleted.");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete.");
    }
  }

  const filteredDocs = documents.filter((d) => {
    if (filterFolder !== "__all") {
      if (filterFolder === "__unfiled" && d.folder_id !== null) return false;
      if (filterFolder !== "__unfiled" && d.folder_id !== filterFolder) return false;
    }
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return <div className="tvp-card tvp-panel"><p className="tvp-muted">Loading Private Vault…</p></div>;
  }
  if (isError) {
    return <div className="tvp-card tvp-panel"><p className="tvp-warn">Failed to load: {(error as Error)?.message}</p></div>;
  }

  return (
    <>
      <input ref={fileInput} type="file" hidden onChange={onFilePicked} />

      <div className="tvp-callout" style={{ background: "var(--tvp-teal-50)", borderColor: "var(--tvp-teal-200)" }}>
        <div className="tvp-callout-icon" style={{ background: "var(--tvp-teal-100)", color: "var(--tvp-teal)" }}>
          <Lock className="h-4 w-4" />
        </div>
        <div>
          <strong>Private by default.</strong>{" "}
          <span className="tvp-muted">
            Folders and files here belong to you. Add or remove folders — your Manager cannot see the Private Vault unless you deliberately share an item.
          </span>
        </div>
      </div>

      <div className="tvp-vault-toolbar" style={{ marginBottom: 18 }}>
        <div className="tvp-vault-search">
          <Search />
          <input
            placeholder="Search private documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="tvp-vault-select" value={filterFolder} onChange={(e) => setFilterFolder(e.target.value)}>
          <option value="__all">Folder: All</option>
          <option value="__unfiled">Unfiled</option>
          {topFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <div>
            <h2 className="tvp-h2">Private Vault Folders</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {topFolders.length} folder{topFolders.length === 1 ? "" : "s"} · fully editable.
            </p>
          </div>
          <div className="tvp-row-actions">
            <button className="tvp-secondary" onClick={onAddTopFolder}><Plus className="h-4 w-4" /> Add Folder</button>
            <button className="tvp-primary" onClick={() => triggerUpload(null)}><Upload className="h-4 w-4" /> Upload</button>
          </div>
        </div>

        {topFolders.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13 }}>No folders yet — add one to get started.</p>
        ) : (
          <div className="tvp-folder-tree">
            {topFolders.map((f) => {
              const subs = subsByParent.get(f.id) ?? [];
              const groups = subs.filter((s) => (subsByParent.get(s.id) ?? []).length > 0);
              const leaves = subs.filter((s) => (subsByParent.get(s.id) ?? []).length === 0);
              const docCount = documents.filter((d) => d.folder_id === f.id).length;
              const open = openFolders.has(f.id);
              return (
                <div key={f.id} className={`tvp-folder-card${open ? " tvp-open" : ""}`}>
                  <button
                    type="button"
                    className="tvp-folder-head"
                    aria-expanded={open}
                    onClick={() => toggleFolder(f.id)}
                  >
                    <span className={`tvp-kpi-icon tvp-bg-${f.tone ?? "teal"}`} style={{ width: 40, height: 40 }}>
                      <Folder className="h-4 w-4" />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="tvp-folder-name" style={{ display: "block" }}>{f.name}</span>
                      <span className="tvp-folder-meta" style={{ display: "block" }}>
                        {subs.length} sub · {docCount} doc{docCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 tvp-folder-chevron" />
                  </button>

                  <div className="tvp-folder-body">
                    <div>
                      <div className="tvp-folder-body-inner">
                        {groups.map((s) => (
                          <div key={s.id}>
                            <div className="tvp-folder-eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {s.name}
                              <button type="button" className="tvp-mini-btn" onClick={() => onDeleteFolder(s.id, s.name, false)} aria-label="Delete group"><Trash2 className="h-3 w-3" /></button>
                            </div>
                            <div className="tvp-subfolder-list" style={{ marginTop: 6 }}>
                              {(subsByParent.get(s.id) ?? []).map((k) => (
                                <span key={k.id} className="tvp-subfolder-pill">
                                  {k.name}
                                  <button type="button" className="tvp-mini-btn" onClick={() => onDeleteFolder(k.id, k.name, false)} aria-label="Delete subfolder"><Trash2 className="h-3 w-3" /></button>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}

                        {leaves.length > 0 && (
                          <div className="tvp-subfolder-list">
                            {leaves.map((s) => (
                              <span key={s.id} className="tvp-subfolder-pill">
                                {s.name}
                                <button type="button" className="tvp-mini-btn" onClick={() => onDeleteFolder(s.id, s.name, false)} aria-label="Delete subfolder"><Trash2 className="h-3 w-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="tvp-footer-actions" style={{ marginTop: 2 }}>
                          <button className="tvp-secondary" onClick={() => triggerUpload(f.id)}><Upload className="h-4 w-4" /> Upload here</button>
                          <button className="tvp-mini-btn" onClick={() => onDeleteFolder(f.id, f.name, true)} aria-label="Remove folder"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        )}
      </div>

      <div className="tvp-card" style={{ marginTop: 22 }}>

        {filteredDocs.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13, padding: "16px 0" }}>
            {documents.length === 0 ? "Nothing uploaded yet — pick a folder above and upload your first document." : "No documents match your filters."}
          </p>
        ) : (
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead><tr><th>Document</th><th>Folder</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {filteredDocs.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td>{folderName(d.folder_id)}</td>
                    <td>{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : "—"}</td>
                    <td>{new Date(d.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="tvp-row-actions">
                        {d.storage_path ? (
                          <button className="tvp-mini-btn" onClick={() => onDownload(d.id)} aria-label="Download">
                            <Download className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="tvp-muted" style={{ fontSize: 11 }}>No file</span>
                        )}
                        <button className="tvp-mini-btn" onClick={() => onDeleteDoc(d.id, d.name)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}


const SHARED_TONES = ["teal", "blue", "purple", "green", "amber", "red"];

function statusTone(status: string) {
  switch (status) {
    case "approved": return "green";
    case "needs_review": return "purple";
    case "resubmission_required": return "amber";
    case "cancelled": return "red";
    default: return "blue";
  }
}

function AgencySharedFolder({ onOpenRequests }: { onOpenRequests: () => void }) {
  const load = useServerFn(getRosterSharedContents);
  const loadDash = useServerFn(getTalentDashboard);
  const { data: dash } = useQuery({ queryKey: ["talent", "dashboard"], queryFn: () => loadDash() });
  const actionRequests = (dash as any)?.actionRequests ?? 0;
  const download = useServerFn(getSharedDocumentDownloadUrl);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("__all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "roster-shared"],
    queryFn: () => load(),
  });

  async function onDownload(id: string) {
    try {
      const { url } = await download({ data: { document_id: id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open file.");
    }
  }

  if (isLoading) {
    return <div className="tvp-card tvp-panel"><p className="tvp-muted">Loading Agency Shared Folder…</p></div>;
  }
  if (isError) {
    return <div className="tvp-card tvp-panel"><p className="tvp-warn">Failed to load: {(error as Error)?.message}</p></div>;
  }
  if (!data?.link) {
    return (
      <div className="tvp-card tvp-panel">
        <h2 className="tvp-h2">No active manager link</h2>
        <p className="tvp-muted" style={{ marginTop: 6 }}>
          You aren't currently linked to a Talent Manager. Once you're invited and accepted, the Agency Shared Folder appears here.
        </p>
      </div>
    );
  }

  const folders = data.folders ?? [];
  const docs = (data.documents ?? []).filter((d) => {
    if (folderFilter !== "__all" && d.folder !== folderFilter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      {actionRequests > 0 && (
        <button type="button" className="tvp-callout tvp-callout-action" onClick={onOpenRequests}>
          <div className="tvp-callout-icon tvp-bg-amber"><Inbox className="h-4 w-4" /></div>
          <div style={{ textAlign: "left" }}>
            <strong>
              {actionRequests} pending request{actionRequests === 1 ? "" : "s"} from your Manager
            </strong>{" "}
            <span className="tvp-muted">Upload the requested documents to keep your shared folder compliant.</span>
          </div>
          <ArrowRight className="h-4 w-4" style={{ marginLeft: "auto", flexShrink: 0 }} />
        </button>
      )}

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><FileStack className="h-4 w-4" /></div>
        <div>
          <strong>Manager-controlled folder structure.</strong>{" "}
          <span className="tvp-muted">
            Your Talent Manager defines the folders in the Agency Shared Folder. You can view and download documents here, but the folder structure itself is read-only for Talent.
          </span>
        </div>
      </div>

      <div className="tvp-vault-toolbar" style={{ marginBottom: 18 }}>
        <div className="tvp-vault-search">
          <Search />
          <input
            placeholder="Search Agency Shared Folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="tvp-vault-select" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
          <option value="__all">Folder: All</option>
          {folders.map((f) => <option key={f.id} value={f.folder_name}>{f.folder_name}</option>)}
        </select>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <div>
            <h2 className="tvp-h2">Agency Shared Folder</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {folders.length} folder{folders.length === 1 ? "" : "s"} · {data.documents.length} document{data.documents.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="tvp-lock-note"><Lock className="h-3 w-3" /> Folder structure locked by Manager</span>
        </div>
        {folders.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13 }}>Your Manager hasn't provisioned any shared folders yet.</p>
        ) : (
          <div className="tvp-folder-tree">
            {folders.map((f, i) => {
              const count = data.documents.filter((d) => d.folder === f.folder_name).length;
              const tone = SHARED_TONES[i % SHARED_TONES.length];
              return (
                <div key={f.id} className="tvp-folder-card">
                  <div className="tvp-folder-head tvp-static">
                    <span className={`tvp-kpi-icon tvp-bg-${tone}`} style={{ width: 40, height: 40 }}>
                      <FolderOpen className="h-4 w-4" />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="tvp-folder-name" style={{ display: "block" }}>{f.folder_name}</span>
                      <span className="tvp-folder-meta" style={{ display: "block" }}>
                        {count} doc{count === 1 ? "" : "s"}
                        {f.retention_years != null
                          ? ` · retention ${f.retention_years} yr${f.retention_years === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </span>
                    <Lock className="h-4 w-4 tvp-folder-chevron" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <div className="tvp-card" style={{ marginTop: 22 }}>

        {docs.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13, padding: "16px 0" }}>No documents match your filters.</p>
        ) : (
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead><tr><th>Document</th><th>Folder</th><th>Status</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td>{d.folder}</td>
                    <td><span className={`tvp-status tvp-${statusTone(d.status)}`}>{d.status.replace(/_/g, " ")}</span></td>
                    <td>{d.validity_expires_at ? new Date(d.validity_expires_at).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="tvp-row-actions">
                        {d.storage_path ? (
                          <button className="tvp-mini-btn" onClick={() => onDownload(d.id)} aria-label="Download">
                            <Download className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="tvp-muted" style={{ fontSize: 11 }}>No file</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function statusChipTone(s: string) {
  if (s === "completed") return "green";
  if (s === "pending" || s === "submitted") return "blue";
  if (s === "resubmission_required") return "amber";
  return "teal";
}

function ManagerRequests() {
  const load = useServerFn(listTalentDocumentRequests);
  const reserve = useServerFn(createTalentRequestUploadUrl);
  const submit = useServerFn(submitTalentDocumentRequest);
  const qc = useQueryClient();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "doc-requests"],
    queryFn: () => load(),
  });

  async function onPick(requestId: string, file: File) {
    setUploadingId(requestId);
    try {
      const { signedUrl, path } = await reserve({
        data: { request_id: requestId, filename: file.name, mime_type: file.type || undefined },
      });
      const put = await fetch(signedUrl, { method: "PUT", body: file, headers: file.type ? { "Content-Type": file.type } : undefined });
      if (!put.ok) throw new Error("Upload failed");
      await submit({
        data: {
          request_id: requestId,
          storage_path: path,
          filename: file.name,
          size_bytes: file.size,
          mime_type: file.type || undefined,
        },
      });
      toast.success("Submitted to your Manager for review.");
      qc.invalidateQueries({ queryKey: ["talent", "doc-requests"] });
      qc.invalidateQueries({ queryKey: ["talent", "roster-shared"] });
      qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploadingId(null);
    }
  }

  if (isLoading) return <div className="tvp-card tvp-panel"><p className="tvp-muted">Loading requests…</p></div>;
  if (isError) return <div className="tvp-card tvp-panel"><p className="tvp-warn">Failed to load: {(error as Error)?.message}</p></div>;
  if (!data?.link) {
    return (
      <div className="tvp-card tvp-panel">
        <h2 className="tvp-h2">No active manager link</h2>
        <p className="tvp-muted" style={{ marginTop: 6 }}>
          Once you're linked to a Talent Manager, requests they send you will appear here.
        </p>
      </div>
    );
  }

  const open = (data.requests ?? []).filter((r: any) =>
    r.status === "pending" || r.status === "resubmission_required" || r.status === "submitted",
  );
  const closed = (data.requests ?? []).filter((r: any) =>
    r.status === "completed" || r.status === "cancelled",
  );

  return (
    <>
      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Inbox className="h-4 w-4" /></div>
        <div>
          <strong>Requests from your Manager.</strong>{" "}
          <span className="tvp-muted">
            Upload the requested document; it lands in your Agency Shared Folder and your Manager reviews it. Previous submissions are kept in history — nothing is deleted.
          </span>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Open requests</h2>
          <span className="tvp-muted" style={{ fontSize: 12 }}>{open.length} open</span>
        </div>
        {open.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13 }}>Nothing waiting on you right now.</p>
        ) : (
          <div className="tvp-doc-grid" style={{ marginTop: 10 }}>
            {open.map((r: any) => (
              <div key={r.id} className="tvp-doc-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div className="tvp-kpi-icon tvp-bg-amber" style={{ width: 38, height: 38, flexShrink: 0 }}>
                    {r.status === "resubmission_required" ? <AlertCircle className="h-4 w-4" /> : <ClockIcon className="h-4 w-4" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{r.title}</strong>
                    <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Folder: {r.folder}
                      {r.due_date && <> · Due {new Date(r.due_date).toLocaleDateString()}</>}
                    </div>
                    {r.instructions && (
                      <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{r.instructions}</div>
                    )}
                    {r.status === "resubmission_required" && (r.review_notes || r.reason_code) && (
                      <div className="tvp-callout" style={{ marginTop: 8, background: "#FFF7ED", borderColor: "#F6C99D" }}>
                        <div className="tvp-callout-icon" style={{ background: "var(--tvp-amber-bg)", color: "var(--tvp-amber)" }}>
                          <AlertCircle className="h-4 w-4" />
                        </div>
                        <div style={{ fontSize: 12 }}>
                          <strong>Manager requested a resubmission</strong>
                          {r.reason_code && <> · reason: {r.reason_code.replace(/_/g, " ")}</>}
                          {r.review_notes && <div className="tvp-muted" style={{ marginTop: 2 }}>{r.review_notes}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className={`tvp-status tvp-${statusChipTone(r.status)}`}>{r.status.replace(/_/g, " ")}</span>
                </div>
                {r.status !== "submitted" && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <input
                      ref={(el) => { fileRefs.current[r.id] = el; }}
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPick(r.id, f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      className="tvp-primary"
                      disabled={uploadingId === r.id}
                      onClick={() => fileRefs.current[r.id]?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingId === r.id ? "Uploading…" : r.status === "resubmission_required" ? "Resubmit" : "Upload response"}
                    </button>
                  </div>
                )}
                {r.status === "submitted" && (
                  <div className="tvp-muted" style={{ fontSize: 12, textAlign: "right" }}>Awaiting Manager review.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="tvp-card tvp-panel" style={{ marginTop: 22 }}>
          <h2 className="tvp-h2">Recent history</h2>
          <div className="tvp-table-wrap" style={{ marginTop: 10 }}>
            <table className="tvp-table">
              <thead><tr><th>Request</th><th>Folder</th><th>Outcome</th><th>Reason</th><th>Reviewed</th></tr></thead>
              <tbody>
                {closed.slice(0, 20).map((r: any) => (
                  <tr key={r.id}>
                    <td><strong>{r.title}</strong></td>
                    <td>{r.folder}</td>
                    <td><span className={`tvp-status tvp-${r.status === "completed" ? "green" : "teal"}`}>
                      {r.status === "completed" ? <><CheckCircle2 className="h-3 w-3" /> completed</> : "cancelled"}
                    </span></td>
                    <td>{r.reason_code ? r.reason_code.replace(/_/g, " ") : "—"}</td>
                    <td>{r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}



