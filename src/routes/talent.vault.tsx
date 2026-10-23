import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { EmptyState, FileTypeIcon, PageBand } from "@/components/shared/brand";
import { usePagedList } from "@/lib/pagination";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { LoadMoreRow } from "@/components/shared/load-more";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
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
  deletePrivateFolder,
  createPrivateUploadUrl,
  finalisePrivateUpload,
  getPrivateDocumentDownloadUrl,
  deletePrivateDocument,
  listVaultCopyTargets,
  copyPrivateDocumentToAgency,
} from "@/lib/talent-vault.functions";
import { copyConfirmText } from "@/lib/vault-copy-core";
import { ModalShell } from "@/components/shared/modal-shell";
import { preflightUpload } from "@/lib/file-validation";

import { AiFilingReviewModal } from "@/components/shared/ai-filing-review-modal";
import { useAnalyseWithAi } from "@/components/shared/use-analyse-with-ai";
import { statusLabel, statusPillClass } from "@/lib/status-labels";
import { PreviewDialog } from "@/components/shared/preview-dialog";
import { toast } from "sonner";
import { useConfirm } from "@/components/shared/use-confirm";
import {
  ChevronRight,
  Upload,
  Lock,
  FileStack,
  Sparkles,
  Download,
  FolderOpen,
  Archive,
  Folder,
  Trash2,
  Inbox,
  AlertCircle,
  CheckCircle2,
  Clock as ClockIcon,
  ChevronDown,
  Search,
  Eye,
  Share2,
} from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/talent/vault")({
  head: () => ({
    meta: [
      { title: "Vault · TalVault Talent" },
      {
        name: "description",
        content: "Manage your private documents and agency-shared folders in TalVault.",
      },
      { property: "og:title", content: "Vault · TalVault Talent" },
      {
        property: "og:description",
        content: "Manage your private documents and agency-shared folders in TalVault.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): {
    tab?: Mode;
    view?: AgencyView;
    doc?: string;
    link?: string;
    request?: string;
  } => {
    const t = search.tab;
    const v = search.view;
    // Legacy deep links used ?tab=requests before Requests was merged into
    // the Agency Shared Folder tab.
    if (t === "requests") return { tab: "agency", view: "requests" };
    const out: { tab?: Mode; view?: AgencyView; doc?: string; link?: string; request?: string } = {};
    if (typeof search.request === "string" && /^[0-9a-f-]{36}$/i.test(search.request)) out.request = search.request;
    if (typeof search.link === "string" && /^[0-9a-f-]{36}$/i.test(search.link)) out.link = search.link;
    if (t === "private" || t === "agency") out.tab = t;
    if (v === "requests" || v === "folder") out.view = v;
    if (typeof search.doc === "string" && search.doc) out.doc = search.doc;
    return out;
  },
  component: VaultPage,
});

type Mode = "private" | "agency";
type AgencyView = "folder" | "requests";

function VaultPage() {
  const { tab, view, link: linkParam } = useSearch({ from: "/talent/vault" });
  const navigate = useNavigate();
  const loadDash = useServerFn(getTalentDashboard);
  const { data: dash } = useQuery({ queryKey: ["talent", "dashboard"], queryFn: () => loadDash() });
  // One shared section per agency the portal shows (active, or ended with
  // shared items). Independent talent see only the Private Vault.
  const links = ((dash as any)?.links ?? []) as {
    id: string;
    agency_name: string;
    state: "active" | "previous";
  }[];
  const [mode, setMode] = useState<Mode>(tab ?? "private");
  const selected = links.find((l) => l.id === linkParam) ?? links[0];

  useEffect(() => {
    if (tab && tab !== mode) setMode(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const goTo = (next: Mode, linkId?: string) => {
    setMode(next);
    navigate({
      to: "/talent/vault",
      search: next === "agency" && linkId ? { tab: next, link: linkId } : { tab: next },
      replace: true,
    });
  };

  const showAgency = mode === "agency" && !!selected;
  const uploadRef = useRef<(() => void) | null>(null);

  return (
    <div className="tv-page">
      <PageBand
        icon={<Lock />}
        title="Vault"
        subtitle={showAgency ? "Documents you and your agency both see." : "Your private documents — only you can see these."}
        actions={
          !showAgency ? (
            <button type="button" className="tvp-primary" data-tour="talent-vault-upload" onClick={() => uploadRef.current?.()}>
              <Upload className="h-4 w-4" /> Upload document
            </button>
          ) : undefined
        }
      />

      <div className="tvp-tabs tvp-roster-tabs tv-page-tabs" role="tablist" aria-label="Vault" data-tour="talent-vault-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={!showAgency}
          className={`tvp-tab${!showAgency ? " tvp-active" : ""}`}
          onClick={() => goTo("private")}
        >
          <Lock className="h-4 w-4" /> Private Vault
        </button>
        {links.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={showAgency && selected?.id === l.id}
            className={`tvp-tab${showAgency && selected?.id === l.id ? " tvp-active" : ""}`}
            onClick={() => goTo("agency", l.id)}
          >
            <FileStack className="h-4 w-4" />{" "}
            {l.state === "active" ? `Shared with ${l.agency_name}` : `Previously shared with ${l.agency_name}`}
          </button>
        ))}
      </div>

      <div data-tour="talent-vault-body">
        {!showAgency && <PrivateVault uploadRef={uploadRef} />}

        {showAgency && selected && (
          <AgencySharedFolder
            key={selected.id}
            linkId={selected.id}
            readOnly={selected.state === "previous"}
            initialView={selected.state === "previous" ? "folder" : (view ?? "folder")}
          />
        )}
      </div>
    </div>
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
  pending_review?: boolean;
  created_at: string;
  updated_at: string;
};

function PrivateVault({ uploadRef }: { uploadRef: MutableRefObject<(() => void) | null> }) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const qc = useQueryClient();
  const load = useServerFn(listPrivateVault);
  const deleteFolder = useServerFn(deletePrivateFolder);
  const createUpload = useServerFn(createPrivateUploadUrl);
  const finalise = useServerFn(finalisePrivateUpload);

  const download = useServerFn(getPrivateDocumentDownloadUrl);
  const deleteDoc = useServerFn(deletePrivateDocument);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [aiReviewFor, setAiReviewFor] = useState<{ id: string; name: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filterFolder, setFilterFolder] = useState<string>("__all");
  const [showAllDocs, setShowAllDocs] = useState(false);

  const [copyFor, setCopyFor] = useState<{ id: string; name: string } | null>(null);
  const loadCopyTargets = useServerFn(listVaultCopyTargets);
  const { data: copyTargets } = useQuery({
    queryKey: ["talent", "vault-copy-targets"],
    queryFn: () =>
      loadCopyTargets() as Promise<{
        targets: {
          talent_link_id: string;
          agency_name: string;
          folders: { id: string; name: string }[];
        }[];
      }>,
  });
  const hasCopyTargets = (copyTargets?.targets ?? []).some((t) => t.folders.length > 0);

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

  const folders = useMemo(() => data?.folders ?? [], [data]);
  const documents = data?.documents ?? [];

  // Deep link from a bell reminder: open the document, or say why we can't.
  const { doc: docParam } = useSearch({ from: "/talent/vault" });
  const navigateDoc = useNavigate();
  useEffect(() => {
    if (!docParam || !data) return;
    const d = (data.documents ?? []).find((x) => x.id === docParam);
    navigateDoc({ to: "/talent/vault", search: { tab: "private" }, replace: true });
    if (d) onView(d.id, d.name);
    else toast.info("This document is no longer available to you.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, data]);
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
    id ? (folders.find((f) => f.id === id)?.name ?? "—") : "Unfiled";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
  const aiRow = useAnalyseWithAi("talent");

  async function onDeleteFolder(id: string, name: string, isTop: boolean) {
    const message = isTop
      ? `Remove "${name}" from your vault? Nothing is deleted — the folder is hidden with its documents intact, and you can restore it later from Settings → Manage folders.`
      : `Permanently delete "${name}"? This cannot be undone, and only empty subfolders can be deleted.`;
    const ok = await confirm({
      title: isTop ? `Remove "${name}"?` : `Delete "${name}"?`,
      body: message,
      confirmLabel: isTop ? "Remove folder" : "Delete subfolder",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFolder({ data: { id } });
      toast.success(
        isTop
          ? "Folder removed — restore it any time from Settings → Manage folders."
          : "Subfolder permanently deleted.",
      );
      invalidate();
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not delete."));
    }
  }

  uploadRef.current = () => triggerUpload(null);
  function triggerUpload(folderId: string | null) {
    setUploadFolderId(folderId);
    fileInput.current?.click();
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = preflightUpload(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      const { upload, document_id } = await createUpload({
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
      // Server-side signature/size check; rejects and cleans up bad files.
      await finalise({ data: { document_id } });
      toast.success("Document uploaded.");
      invalidate();

      if (document_id) setAiReviewFor({ id: document_id as string, name: file.name });
    } catch (err: any) {
      toast.error(friendlyError(err, "Upload failed."));
    }
  }

  async function onDownload(id: string) {
    try {
      const { url } = await download({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not open file."));
    }
  }

  async function onView(id: string, name: string) {
    try {
      const { url } = await download({ data: { id } });
      setPreview({ url, name });
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not open file."));
    }
  }

  async function onDeleteDoc(id: string, name: string) {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      body: "The file is removed from your Private Vault. It can't be undone.",
      confirmLabel: "Delete document",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc({ data: { id } });
      toast.success("Document deleted.");
      invalidate();
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not delete."));
    }
  }

  // Filtering by a top-level folder includes everything filed in its
  // sub-folders, otherwise picking a category looks empty.
  function folderAndDescendants(id: string): Set<string> {
    const out = new Set<string>([id]);
    const walk = (parent: string) => {
      for (const child of subsByParent.get(parent) ?? []) {
        if (out.has(child.id)) continue;
        out.add(child.id);
        walk(child.id);
      }
    };
    walk(id);
    return out;
  }

  const filterScope =
    filterFolder !== "__all" && filterFolder !== "__unfiled" && filterFolder !== "__pending"
      ? folderAndDescendants(filterFolder)
      : null;

  const pendingCount = documents.filter((d) => d.pending_review).length;

  const filteredDocs = documents.filter((d) => {
    if (filterFolder === "__pending" && !d.pending_review) return false;
    if (filterFolder === "__unfiled" && d.folder_id !== null) return false;
    if (filterScope && (!d.folder_id || !filterScope.has(d.folder_id))) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const docPage = usePagedList(filteredDocs, {
    resetKey: `${filterFolder}|${search}`,
  });

  // Searching or filtering implicitly reveals the flat list, so users never
  // have to click "View all documents" first to see their results.
  const isFiltering = search.trim() !== "" || filterFolder !== "__all";
  const docsVisible = showAllDocs || isFiltering;

  if (isLoading) {
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvp-muted">Loading Private Vault…</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvp-warn">{friendlyError(error, "This page could not be loaded. Please try again.")}</p>
      </div>
    );
  }

  return (
    <>
      {confirmDialog}
      <input ref={fileInput} type="file" hidden onChange={onFilePicked} />

      <VaultFilters
        search={search}
        onSearch={setSearch}
        placeholder="Search private documents"
        folder={{ key: "folder", label: "Folder", value: filterFolder, options: [{ value: "__all", label: "All folders" }, { value: "__unfiled", label: "Unfiled" }, { value: "__pending", label: "Pending review", count: pendingCount || undefined }, ...topFolders.map((x) => ({ value: x.id, label: x.name }))] }}
        onFolder={setFilterFolder}
        showAll={docsVisible}
        onShowAll={setShowAllDocs}
        label="Private vault view"
      />

      {!docsVisible && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Private Vault Folders</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {topFolders.length} folder{topFolders.length === 1 ? "" : "s"} · choose which
                categories appear in Settings → Manage folders.
              </p>
            </div>
          </div>

          {topFolders.length === 0 ? (
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              No folders switched on yet — turn categories on under Settings → Manage folders.
            </p>
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
                      <span
                        className={`tvp-kpi-icon tvp-bg-${f.tone ?? "teal"}`}
                        style={{ width: 40, height: 40 }}
                      >
                        <Folder className="h-4 w-4" />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="tvp-folder-name" style={{ display: "block" }}>
                          {f.name}
                        </span>
                        <span className="tvp-folder-meta" style={{ display: "block" }}>
                          {docCount} {docCount === 1 ? "document" : "documents"}
                          {subs.length > 0 && ` · ${subs.length} ${subs.length === 1 ? "subfolder" : "subfolders"}`}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 tvp-folder-chevron" />
                    </button>

                    <div className="tvp-folder-body">
                      <div>
                        <div className="tvp-folder-body-inner">
                          {groups.map((s) => (
                            <div key={s.id}>
                              <div
                                className="tvp-folder-eyebrow"
                                style={{ display: "flex", alignItems: "center", gap: 6 }}
                              >
                                {s.name}
                                <button
                                  title="Delete group"
                                  type="button"
                                  className="tvp-mini-btn"
                                  onClick={() => onDeleteFolder(s.id, s.name, false)}
                                  aria-label="Delete group"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="tvp-subfolder-list" style={{ marginTop: 6 }}>
                                {(subsByParent.get(s.id) ?? []).map((k) => (
                                  <span key={k.id} className="tvp-subfolder-pill">
                                    {k.name}
                                    <button
                                      title="Delete subfolder"
                                      type="button"
                                      className="tvp-mini-btn"
                                      onClick={() => onDeleteFolder(k.id, k.name, false)}
                                      aria-label="Delete subfolder"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
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
                                  <button
                                    title="Delete subfolder"
                                    type="button"
                                    className="tvp-mini-btn"
                                    onClick={() => onDeleteFolder(s.id, s.name, false)}
                                    aria-label="Delete subfolder"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="tvp-footer-actions" style={{ marginTop: 2 }}>
                            <button className="tvp-secondary" onClick={() => triggerUpload(f.id)}>
                              <Upload className="h-4 w-4" /> Upload here
                            </button>
                            <button
                              title="Remove folder — hidden, restorable from Settings"
                              className="tvp-mini-btn"
                              onClick={() => onDeleteFolder(f.id, f.name, true)}
                              aria-label="Remove folder (restorable)"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
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
      )}

      {docsVisible && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">All private documents</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {filteredDocs.length === documents.length
                  ? `${filteredDocs.length} document${filteredDocs.length === 1 ? "" : "s"} across all folders`
                  : `${filteredDocs.length} of ${documents.length} document${documents.length === 1 ? "" : "s"} match`}
              </p>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            documents.length === 0 ? (
              <EmptyState
                icon={<Lock />}
                tint="teal"
                title="No documents yet"
                action={
                  <button type="button" className="tvp-primary" onClick={() => triggerUpload(null)}>
                    <Upload className="h-4 w-4" /> Upload document
                  </button>
                }
              >
                Upload your first document to keep it safe in your private vault.
              </EmptyState>
            ) : (
              <EmptyState icon={<Search />} tint="blue" title="No matches">
                No documents match your search or folder filter — clear them to see everything.
              </EmptyState>
            )
          ) : (
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Folder</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {docPage.visible.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span className="tv-doc-name"><FileTypeIcon name={d.name} /><strong>{d.name}</strong></span>
                        {d.pending_review && (
                          <span
                            className={`${statusPillClass("document", "pending_review")} tvp-pending-pill`}
                          >
                            {statusLabel("document", "pending_review")}
                          </span>
                        )}
                      </td>
                      <td>{folderName(d.folder_id)}</td>
                      <td>{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : "—"}</td>
                      <td>{new Date(d.created_at).toLocaleDateString("en-GB")}</td>
                      <td>
                        <div className="tvp-row-actions">
                          <RowActionsMenu
                            actions={[
                              d.pending_review && {
                                key: "review",
                                label: "Finish filing review",
                                icon: Sparkles,
                                onSelect: () => setAiReviewFor({ id: d.id, name: d.name }),
                              },
                              aiRow.canAnalyse(d.pending_review) && {
                                key: "analyse",
                                label: "Analyse with AI",
                                icon: Sparkles,
                                disabled: !d.storage_path || aiRow.isPending,
                                onSelect: () =>
                                  aiRow.analyse({
                                    id: d.id,
                                    name: d.name,
                                    open: () => setAiReviewFor({ id: d.id, name: d.name }),
                                  }),
                              },
                              {
                                key: "view",
                                label: "View document",
                                icon: Eye,
                                disabled: !d.storage_path,
                                title: d.storage_path
                                  ? undefined
                                  : "No file attached to this document",
                                onSelect: () => onView(d.id, d.name),
                              },
                              {
                                key: "download",
                                label: "Download document",
                                icon: Download,
                                disabled: !d.storage_path,
                                title: d.storage_path
                                  ? undefined
                                  : "No file attached to this document",
                                onSelect: () => onDownload(d.id),
                              },
                              hasCopyTargets && {
                                key: "copy",
                                label: "Copy to agency shared folder",
                                icon: Share2,
                                disabled: !d.storage_path,
                                title: d.storage_path
                                  ? undefined
                                  : "No file attached to this document",
                                onSelect: () => setCopyFor({ id: d.id, name: d.name }),
                              },
                              {
                                key: "delete",
                                label: "Delete document",
                                icon: Trash2,
                                destructive: true,
                                separatorBefore: true,
                                onSelect: () => onDeleteDoc(d.id, d.name),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <LoadMoreRow
                    colSpan={6}
                    noun="documents"
                    shown={docPage.shown}
                    total={docPage.total}
                    hasMore={docPage.hasMore}
                    onLoadMore={docPage.loadMore}
                  />
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {preview && (
        <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />
      )}

      {aiReviewFor && (
        <AiFilingReviewModal
          scope="talent"
          documentId={aiReviewFor.id}
          documentName={aiReviewFor.name}
          destinationPrefix="Private Vault"
          onClose={() => setAiReviewFor(null)}
          onDone={() => {
            setAiReviewFor(null);
            invalidate();
          }}
        />
      )}

      {copyFor && (
        <CopyToAgencyDialog
          documentId={copyFor.id}
          documentName={copyFor.name}
          targets={copyTargets?.targets ?? []}
          onClose={() => setCopyFor(null)}
        />
      )}
    </>
  );
}

const SHARED_TONES = ["teal", "blue", "purple", "green", "amber", "red"];

type CopyTarget = {
  talent_link_id: string;
  agency_name: string;
  folders: { id: string; name: string }[];
};

/**
 * Talent-only dialog: copy a Private Vault document into an agency shared
 * folder. The original stays private; the copy follows shared folder rules.
 */
function CopyToAgencyDialog({
  documentId,
  documentName,
  targets,
  onClose,
}: {
  documentId: string;
  documentName: string;
  targets: CopyTarget[];
  onClose: () => void;
}) {
  const copyFn = useServerFn(copyPrivateDocumentToAgency);
  const usable = targets.filter((t) => t.folders.length > 0);
  const [linkId, setLinkId] = useState<string>(usable[0]?.talent_link_id ?? "");
  const [folder, setFolder] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = usable.find((t) => t.talent_link_id === linkId) ?? null;

  async function onCopy() {
    if (!target || !folder) return;
    setBusy(true);
    setError(null);
    try {
      await copyFn({
        data: { document_id: documentId, talent_link_id: target.talent_link_id, folder },
      });
      toast.success(`Copied to your shared folder with ${target.agency_name}.`);
      onClose();
    } catch (e: any) {
      setError(friendlyError(e, "The document couldn't be copied."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth={520} labelledBy="tvp-copy-title">
      <h2 className="tvp-h2" id="tvp-copy-title">
        Copy to agency shared folder
      </h2>
      <p className="tvp-muted" style={{ marginTop: 8 }}>
        {copyConfirmText(documentName, target?.agency_name ?? "your agency")}
      </p>

      {usable.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <label className="tvp-field-label" htmlFor="tvp-copy-agency">
            Agency
          </label>
          <select
            id="tvp-copy-agency"
            className="tvp-select"
            value={linkId}
            onChange={(e) => {
              setLinkId(e.target.value);
              setFolder("");
            }}
          >
            {usable.map((t) => (
              <option key={t.talent_link_id} value={t.talent_link_id}>
                {t.agency_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label className="tvp-field-label" htmlFor="tvp-copy-folder">
          Folder
        </label>
        <select
          id="tvp-copy-folder"
          className="tvp-select"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">Choose a folder…</option>
          {(target?.folders ?? []).map((f) => (
            <option key={f.id} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <label
        className="tvp-muted"
        style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>I understand the copy can't be removed by me once it's shared.</span>
      </label>

      {error && (
        <p className="tvp-field-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <div className="tvp-form-footer">
        <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="tvp-primary"
          disabled={busy || !target || !folder || !confirmed}
          onClick={onCopy}
        >
          {busy ? "Copying…" : "Copy to shared folder"}
        </button>
      </div>
    </ModalShell>
  );
}

function statusTone(status: string) {
  switch (status) {
    case "approved":
      return "green";
    case "needs_review":
      return "purple";
    case "resubmission_required":
      return "amber";
    case "cancelled":
      return "red";
    default:
      return "blue";
  }
}

function AgencySharedFolder({
  initialView,
  linkId,
  readOnly,
}: {
  initialView: AgencyView;
  linkId: string;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<AgencyView>(initialView);
  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const loadReq = useServerFn(listTalentDocumentRequests);
  const { data: reqData } = useQuery({
    queryKey: ["talent", "doc-requests", linkId],
    queryFn: () => loadReq({ data: { link_id: linkId } }),
    enabled: !readOnly,
  });
  const actionRequests = ((reqData as any)?.requests ?? []).filter((r: any) =>
    ["pending", "resubmission_required"].includes(r.status),
  ).length;

  const go = (next: AgencyView) => {
    setView(next);
    navigate({ to: "/talent/vault", search: { tab: "agency", view: next, link: linkId }, replace: true });
  };

  // Ended relationship: read-only list of what was shared — no requests, no upload.
  if (readOnly) return <SharedDocumentsView linkId={linkId} />;

  return (
    <>
      <div className="tvp-subtabs" role="tablist" aria-label="Shared folder sections">
        <button
          type="button"
          role="tab"
          aria-selected={view === "folder"}
          className={`tvp-subtab${view === "folder" ? " tvp-active" : ""}`}
          onClick={() => go("folder")}
        >
          <FolderOpen className="h-4 w-4" /> Shared documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "requests"}
          className={`tvp-subtab${view === "requests" ? " tvp-active" : ""}`}
          onClick={() => go("requests")}
        >
          <Inbox className="h-4 w-4" /> Requests
          {actionRequests > 0 && <span className="tvp-subtab-badge">{actionRequests}</span>}
        </button>
      </div>

      {view === "folder" ? <SharedDocumentsView linkId={linkId} /> : <ManagerRequests linkId={linkId} />}
    </>
  );
}

function SharedDocumentsView({ linkId }: { linkId: string }) {
  const load = useServerFn(getRosterSharedContents);
  const download = useServerFn(getSharedDocumentDownloadUrl);

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("__all");
  const [showAllDocs, setShowAllDocs] = useState(false);
  const docsVisible = showAllDocs || search.trim() !== "" || folderFilter !== "__all";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "roster-shared", linkId],
    queryFn: () => load({ data: { link_id: linkId } }),
  });

  // Deep link from a bell reminder: open the document, or say why we can't.
  const { doc: docParam } = useSearch({ from: "/talent/vault" });
  const navigateDoc = useNavigate();
  useEffect(() => {
    if (!docParam || !data) return;
    const d = (data.documents ?? []).find((x: any) => x.id === docParam);
    navigateDoc({ to: "/talent/vault", search: { tab: "agency", view: "folder", link: linkId }, replace: true });
    if (d) onDownload(d.id);
    else toast.info("This document is no longer available to you.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, data]);

  async function onDownload(id: string) {
    try {
      const { url } = await download({ data: { document_id: id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not open file."));
    }
  }

  if (isLoading) {
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvp-muted">Loading Agency Shared Folder…</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvp-warn">{friendlyError(error, "This page could not be loaded. Please try again.")}</p>
      </div>
    );
  }
  if (!data?.link) {
    return (
      <div className="tvp-card tvp-panel">
        <h2 className="tvp-h2">No active manager link</h2>
        <p className="tvp-muted" style={{ marginTop: 6 }}>
          You aren't currently linked to an agency. Once you're invited and accepted, the
          Agency Shared Folder appears here.
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
      <VaultFilters
        search={search}
        onSearch={setSearch}
        placeholder="Search shared documents"
        folder={{ key: "folder", label: "Folder", value: folderFilter, options: [{ value: "__all", label: "All folders" }, ...folders.map((x) => ({ value: x.folder_name, label: x.folder_name }))] }}
        onFolder={setFolderFilter}
        showAll={docsVisible}
        onShowAll={setShowAllDocs}
        label="Shared folder view"
      />

      {!docsVisible && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">
                {(data.link as any).state === "previous" ? "Previously shared with " : "Shared with "}
                {(data.link as any).agency_name}
              </h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {folders.filter((f: any) => f.parent_folder_id).length || folders.length} folder
                {(folders.filter((f: any) => f.parent_folder_id).length || folders.length) === 1 ? "" : "s"} · {data.documents.length}{" "}
                document{data.documents.length === 1 ? "" : "s"}
              </p>
            </div>
            <span
              className="tvp-lock-note"
              title="Your agency sets up these folders. You can't add, rename or remove them."
            >
              <Lock className="h-3 w-3" aria-hidden="true" /> Folders set by your agency
            </span>
          </div>
          {data.read_until && (
            <p className="tvp-muted" style={{ fontSize: 13, marginBottom: 12 }}>
              This connection has ended. You can view and download these items, read-only, for 10
              years from the date the relationship ended — until{" "}
              {new Date(data.read_until).toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </p>
          )}
          {folders.length === 0 ? (
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              Your agency hasn't provisioned any shared folders yet.
            </p>
          ) : (
            <SharedFolderTree
              folders={folders as any[]}
              documents={data.documents}
              onOpenFolder={(name) => setFolderFilter(name)}
            />
          )}
        </div>
      )}

      {docsVisible && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">All shared documents</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {docs.length === data.documents.length
                  ? `${docs.length} document${docs.length === 1 ? "" : "s"} across all folders`
                  : `${docs.length} of ${data.documents.length} document${data.documents.length === 1 ? "" : "s"} match`}
              </p>
            </div>
          </div>

          {docs.length === 0 ? (
            data.documents.length === 0 ? (
              <EmptyState icon={<FileStack />} tint="lavender" title="Nothing shared yet">
                Your agency hasn't shared any documents with you yet.
              </EmptyState>
            ) : (
              <EmptyState icon={<Search />} tint="blue" title="No matches">
                No documents match your search or folder filter — clear them to see everything.
              </EmptyState>
            )
          ) : (
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Folder</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.name}</strong>
                        {d.pending_review && (
                          <span
                            className={`${statusPillClass("document", "pending_review")} tvp-pending-pill`}
                          >
                            {statusLabel("document", "pending_review")}
                          </span>
                        )}
                      </td>
                      <td>{d.folder}</td>
                      <td>
                        <span className={`tvp-status tvp-${statusTone(d.status)}`}>
                          {d.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        {d.validity_expires_at
                          ? new Date(d.validity_expires_at).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td>
                        <div className="tvp-row-actions">
                          {d.storage_path ? (
                            <button
                              title="Download document"
                              className="tvp-mini-btn"
                              onClick={() => onDownload(d.id)}
                              aria-label="Download"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="tvp-muted" style={{ fontSize: 11 }}>
                              No file
                            </span>
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
      )}
    </>
  );
}

/**
 * Agency shared folder as categories that open to their subfolders, mirroring
 * the agency's own folder view. Folders without a parent are categories;
 * a folder with no children and no parent is shown as a standalone folder.
 */
function SharedFolderTree({
  folders,
  documents,
  onOpenFolder,
}: {
  folders: { id: string; folder_name: string; parent_folder_id: string | null; retention_years: number | null }[];
  documents: { folder: string }[];
  onOpenFolder: (name: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const countOf = (name: string) => documents.filter((d) => d.folder === name).length;
  const roots = folders.filter((f) => !f.parent_folder_id);
  const childrenOf = (id: string) => folders.filter((f) => f.parent_folder_id === id);
  return (
    <div className="tvp-folder-tree">
      {roots.map((c, i) => {
        const kids = childrenOf(c.id);
        const total = countOf(c.folder_name) + kids.reduce((n, k) => n + countOf(k.folder_name), 0);
        const tone = SHARED_TONES[i % SHARED_TONES.length];
        const isOpen = open === c.id;
        return (
          <div key={c.id} className="tvp-folder-card">
            <button
              type="button"
              className="tvp-folder-head"
              aria-expanded={kids.length ? isOpen : undefined}
              onClick={() => (kids.length ? setOpen(isOpen ? null : c.id) : onOpenFolder(c.folder_name))}
            >
              <span className={`tvp-kpi-icon tvp-bg-${tone}`} style={{ width: 40, height: 40 }}>
                <FolderOpen className="h-4 w-4" />
              </span>
              <span style={{ minWidth: 0, textAlign: "left" }}>
                <span className="tvp-folder-name" style={{ display: "block" }}>
                  {c.folder_name}
                </span>
                <span className="tvp-folder-meta" style={{ display: "block" }}>
                  {kids.length ? `${kids.length} ${kids.length === 1 ? "folder" : "folders"} · ` : ""}
                  {total} {total === 1 ? "document" : "documents"}
                </span>
              </span>
              {kids.length > 0 && (
                <ChevronRight
                  className="h-4 w-4 tvp-folder-chevron"
                  style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
                  aria-hidden="true"
                />
              )}
            </button>
            {isOpen && (
              <ul className="tvp-folder-children">
                {kids.map((k) => {
                  const n = countOf(k.folder_name);
                  return (
                    <li key={k.id}>
                      <button type="button" className="tvp-link" onClick={() => onOpenFolder(k.folder_name)}>
                        {k.folder_name}
                      </button>
                      <span className="tvp-folder-meta">
                        {" "}
                        · {n} {n === 1 ? "document" : "documents"}
                        {k.retention_years != null
                          ? ` · kept for ${k.retention_years} ${k.retention_years === 1 ? "year" : "years"}`
                          : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusChipTone(s: string) {
  if (s === "completed") return "green";
  if (s === "pending" || s === "submitted") return "blue";
  if (s === "resubmission_required") return "amber";
  return "teal";
}

function ManagerRequests({ linkId }: { linkId: string }) {
  const load = useServerFn(listTalentDocumentRequests);
  const reserve = useServerFn(createTalentRequestUploadUrl);
  const submit = useServerFn(submitTalentDocumentRequest);
  const qc = useQueryClient();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "doc-requests", linkId],
    queryFn: () => load({ data: { link_id: linkId } }),
  });

  // Deep link from the bell: bring the request (and its folder) into view
  // with its upload button focused, or explain that it's already done.
  const { request: requestParam } = useSearch({ from: "/talent/vault" });
  useEffect(() => {
    if (!requestParam || !data) return;
    const r = (data.requests ?? []).find((x: any) => x.id === requestParam);
    const isOpen = r && ["pending", "resubmission_required"].includes(r.status);
    if (!isOpen) {
      toast.info(
        r ? "That request is already done — nothing more to upload." : "That request is no longer available.",
      );
      return;
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(`tv-request-${requestParam}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  }, [requestParam, data]);

  async function onPick(requestId: string, file: File) {
    setUploadingId(requestId);
    try {
      const { signedUrl, path } = await reserve({
        data: { request_id: requestId, filename: file.name, mime_type: file.type || undefined },
      });
      const put = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
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
      toast.success("Submitted to your agency for review.");
      qc.invalidateQueries({ queryKey: ["talent", "doc-requests"] });
      qc.invalidateQueries({ queryKey: ["talent", "roster-shared"] });
      qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
    } catch (e: any) {
      toast.error(friendlyError(e, "Upload failed"));
    } finally {
      setUploadingId(null);
    }
  }

  if (isLoading)
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvp-muted">Loading requests…</p>
      </div>
    );
  if (isError)
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvp-warn">{friendlyError(error, "This page could not be loaded. Please try again.")}</p>
      </div>
    );
  if (!data?.link) {
    return (
      <div className="tvp-card tvp-panel">
        <h2 className="tvp-h2">No active manager link</h2>
        <p className="tvp-muted" style={{ marginTop: 6 }}>
          Once you're linked to an agency, requests they send you will appear here.
        </p>
      </div>
    );
  }

  const open = (data.requests ?? []).filter(
    (r: any) =>
      r.status === "pending" || r.status === "resubmission_required" || r.status === "submitted",
  );
  const focusId = requestParam && open.some((r: any) => r.id === requestParam) ? requestParam : null;
  const closed = (data.requests ?? []).filter(
    (r: any) => r.status === "completed" || r.status === "cancelled",
  );

  return (
    <>
      <div className="tvp-callout">
        <div className="tvp-callout-icon">
          <Inbox className="h-4 w-4" />
        </div>
        <div>
          <strong>Requests.</strong>{" "}
          <span className="tvp-muted">
            Upload the requested document; it lands in your Agency Shared Folder and your agency
            reviews it. Previous submissions are kept in history — nothing is deleted.
          </span>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Open requests</h2>
          <span className="tvp-muted" style={{ fontSize: 12 }}>
            {open.length} open
          </span>
        </div>
        {open.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            Nothing waiting on you right now — you're all caught up.
          </p>
        ) : (
          <div className="tvp-doc-grid" style={{ marginTop: 10 }}>
            {open.map((r: any) => (
              <div
                key={r.id}
                id={`tv-request-${r.id}`}
                className={`tvp-doc-card${focusId === r.id ? " tvp-request-focus" : ""}`}
                style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10 }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    className="tvp-kpi-icon tvp-bg-amber"
                    style={{ width: 38, height: 38, flexShrink: 0 }}
                  >
                    {r.status === "resubmission_required" ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <ClockIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{r.title}</strong>
                    <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Folder: {r.folder}
                      {r.due_date && <> · Due {new Date(r.due_date).toLocaleDateString("en-GB")}</>}
                    </div>
                    {r.instructions && (
                      <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                        {r.instructions}
                      </div>
                    )}
                    {r.status === "resubmission_required" && (r.review_notes || r.reason_code) && (
                      <div
                        className="tvp-callout"
                        style={{ marginTop: 8, background: "#FFF7ED", borderColor: "#F6C99D" }}
                      >
                        <div
                          className="tvp-callout-icon"
                          style={{ background: "var(--tvp-amber-bg)", color: "var(--tvp-amber)" }}
                        >
                          <AlertCircle className="h-4 w-4" />
                        </div>
                        <div style={{ fontSize: 12 }}>
                          <strong>Your agency asked for a resubmission</strong>
                          {r.reason_code && <> · reason: {r.reason_code.replace(/_/g, " ")}</>}
                          {r.review_notes && (
                            <div className="tvp-muted" style={{ marginTop: 2 }}>
                              {r.review_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className={`tvp-status tvp-${statusChipTone(r.status)}`}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                </div>
                {r.status !== "submitted" && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <input
                      ref={(el) => {
                        fileRefs.current[r.id] = el;
                      }}
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
                      {uploadingId === r.id
                        ? "Uploading…"
                        : r.status === "resubmission_required"
                          ? "Resubmit"
                          : "Upload response"}
                    </button>
                  </div>
                )}
                {r.status === "submitted" && (
                  <div className="tvp-muted" style={{ fontSize: 12, textAlign: "right" }}>
                    Waiting for your agency to review.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="tvp-card tvp-panel" style={{ marginTop: 22 }}>
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Recent history</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                Closed requests. Nothing here is deleted — submissions stay on record.
              </p>
            </div>
            <span className="tvp-muted" style={{ fontSize: 12, fontWeight: 800 }}>
              {closed.length} closed
            </span>
          </div>

          <ul className="tvp-history-list">
            {closed.slice(0, 20).map((r: any) => {
              const done = r.status === "completed";
              return (
                <li key={r.id} className="tvp-history-row">
                  <span className={`tvp-history-dot${done ? " tvp-green" : " tvp-grey"}`}>
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                  </span>
                  <div className="tvp-history-main">
                    <div className="tvp-history-title">
                      <strong>{r.title}</strong>
                      <span className={`tvp-status tvp-${done ? "green" : "grey"}`}>
                        {done ? "completed" : "cancelled"}
                      </span>
                    </div>
                    <div className="tvp-history-meta">
                      <span>
                        <FolderOpen className="h-3 w-3" /> {r.folder}
                      </span>
                      {r.reviewed_at && (
                        <span>
                          <ClockIcon className="h-3 w-3" /> Reviewed{" "}
                          {new Date(r.reviewed_at).toLocaleDateString("en-GB")}
                        </span>
                      )}
                    </div>
                    {r.reason_code && (
                      <div className="tvp-history-reason">
                        Reason: {String(r.reason_code).replace(/_/g, " ")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/** Search + folder filter + compact By folder / All documents switch, one card. */
function VaultFilters({
  search,
  onSearch,
  placeholder,
  folder,
  onFolder,
  showAll,
  onShowAll,
  label,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  folder: FilterDef;
  onFolder: (v: string) => void;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="tvp-card tv-filter-card">
      <FilterBar
        search={{ value: search, onChange: onSearch, label: "Search", placeholder }}
        filters={[folder]}
        onChange={(_, v) => onFolder(v)}
      />
      <div className="tv-seg" role="tablist" aria-label={label}>
        <button type="button" role="tab" aria-selected={!showAll} className={!showAll ? "tvp-active" : ""} onClick={() => onShowAll(false)}>
          <Folder className="h-4 w-4" aria-hidden="true" /> By folder
        </button>
        <button type="button" role="tab" aria-selected={showAll} className={showAll ? "tvp-active" : ""} onClick={() => onShowAll(true)}>
          <FileStack className="h-4 w-4" aria-hidden="true" /> All documents
        </button>
      </div>
    </div>
  );
}
