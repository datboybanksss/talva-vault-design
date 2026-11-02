import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileStack,
  Folder,
  FolderInput,
  FolderOpen,
  Inbox,
  Lock,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { EmptyState, FileTypeIcon } from "@/components/shared/brand";
import { RowActionsMenu, type RowAction } from "@/components/shared/row-actions-menu";
import { BlockedDocumentPill, blockedReason } from "@/components/shared/blocked-document";
import { LoadMoreRow } from "@/components/shared/load-more";
import { ModalShell } from "@/components/shared/modal-shell";
import { PreviewDialog } from "@/components/shared/preview-dialog";
import { AiFilingReviewModal } from "@/components/shared/ai-filing-review-modal";
import { useAnalyseWithAi } from "@/components/shared/use-analyse-with-ai";
import { useConfirm } from "@/components/shared/use-confirm";
import { quarantineReason } from "@/lib/document-quarantine";
import { usePagedList } from "@/lib/pagination";
import { preflightUpload } from "@/lib/file-validation";
import { friendlyError } from "@/lib/friendly-error";
import { fmtDate } from "@/lib/display-dates";
import { formatBytes } from "@/lib/file-validation";
import { buildVaultTree, expiresSoon, needsFiling } from "@/lib/private-vault-tree";
import { copyConfirmText } from "@/lib/vault-copy-core";
import { SHARE_RECIPIENT_TERM } from "@/lib/terms";
import {
  listPrivateVault,
  deletePrivateFolder,
  createPrivateUploadUrl,
  finalisePrivateUpload,
  getPrivateDocumentDownloadUrl,
  deletePrivateDocument,
  movePrivateDocument,
  listVaultCopyTargets,
  copyPrivateDocumentToAgency,
} from "@/lib/talent-vault.functions";

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
  validated_at?: string | null;
  quarantine_reason?: string | null;
};
type CopyTarget = {
  talent_link_id: string;
  agency_name: string;
  folders: { id: string; name: string }[];
};

/** Where the "By folder" view is: the folder grid, or inside one folder. */
type Place =
  | { kind: "grid" }
  | { kind: "unfiled" }
  | { kind: "folder"; categoryId: string; sub: "all" | "direct" | string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function PrivateVault({
  uploadRef,
  expiryNoticeDays,
}: {
  uploadRef: MutableRefObject<(() => void) | null>;
  expiryNoticeDays: number;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const [place, setPlace] = useState<Place>({ kind: "grid" });
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [copyFor, setCopyFor] = useState<{ id: string; name: string } | null>(null);
  const [moveFor, setMoveFor] = useState<PrivateDoc | null>(null);

  const loadCopyTargets = useServerFn(listVaultCopyTargets);
  const { data: copyTargets } = useQuery({
    queryKey: ["talent", "vault-copy-targets"],
    queryFn: () => loadCopyTargets() as Promise<{ targets: CopyTarget[] }>,
  });
  const hasCopyTargets = (copyTargets?.targets ?? []).some((t) => t.folders.length > 0);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "private-vault"],
    queryFn: () => load() as Promise<{ folders: PrivateFolder[]; documents: PrivateDoc[] }>,
  });
  const folders = useMemo(() => data?.folders ?? [], [data]);
  const documents = useMemo(() => data?.documents ?? [], [data]);
  const tree = useMemo(() => buildVaultTree(folders, documents), [folders, documents]);

  // Deep link from a bell reminder: open the document, or say why we can't.
  const { doc: docParam } = useSearch({ from: "/talent/vault" });
  useEffect(() => {
    if (!docParam || !data) return;
    const d = documents.find((x) => x.id === docParam);
    navigate({ to: "/talent/vault", search: { tab: "private" }, replace: true });
    if (d) void onView(d.id, d.name);
    else toast.info("This document is no longer available to you.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["talent", "private-vault"] });
    void qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
  };
  const aiRow = useAnalyseWithAi("talent");

  // A folder removed while open falls back to the folder grid.
  useEffect(() => {
    if (place.kind === "folder" && data && !tree.byId.has(place.categoryId))
      setPlace({ kind: "grid" });
  }, [place, data, tree]);

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
      await finalise({ data: { document_id } });
      toast.success("Document uploaded.");
      invalidate();
      if (document_id) setAiReviewFor({ id: document_id as string, name: file.name });
    } catch (err) {
      toast.error(friendlyError(err, "Upload failed."));
    }
  }

  async function onDownload(id: string) {
    try {
      const { url } = await download({ data: { id } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(friendlyError(e, "Could not open file."));
    }
  }

  async function onView(id: string, name: string) {
    try {
      const { url } = await download({ data: { id } });
      setPreview({ url, name });
    } catch (e) {
      toast.error(friendlyError(e, "Could not open file."));
    }
  }

  async function onDeleteDoc(id: string, name: string) {
    const ok = await confirm({
      title: `Delete ${name}?`,
      body: "The file is removed from your Private Vault. This can’t be undone.",
      confirmLabel: "Delete document",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc({ data: { id } });
      toast.success("Document deleted.");
      invalidate();
    } catch (e) {
      toast.error(friendlyError(e, "Could not delete."));
    }
  }

  async function onDeleteFolder(id: string, name: string, isTop: boolean) {
    const ok = await confirm({
      title: isTop ? `Remove ${name}?` : `Delete ${name}?`,
      body: isTop
        ? "Nothing is deleted. The folder is hidden with its documents intact, and you can restore it from Settings › Manage folders."
        : "Only empty subfolders can be deleted. This can’t be undone.",
      confirmLabel: isTop ? "Remove folder" : "Delete subfolder",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFolder({ data: { id } });
      toast.success(
        isTop
          ? "Folder removed. Restore it any time from Settings › Manage folders."
          : "Subfolder deleted.",
      );
      if (isTop) setPlace({ kind: "grid" });
      invalidate();
    } catch (e) {
      toast.error(friendlyError(e, "Could not delete."));
    }
  }

  function organise() {
    const first =
      tree.unfiled.find((d) => d.pending_review && !quarantineReason(d)) ??
      tree.unfiled.find((d) => !quarantineReason(d));
    if (first) setAiReviewFor({ id: first.id, name: first.name });
    else setPlace({ kind: "unfiled" });
  }

  // Filtering by a category includes everything in its subfolders.
  const filterScope =
    filterFolder !== "__all" && filterFolder !== "__unfiled" && filterFolder !== "__pending"
      ? tree.descendants(filterFolder)
      : null;
  const pendingCount = documents.filter((d) => d.pending_review).length;
  const filteredDocs = documents.filter((d) => {
    if (filterFolder === "__pending" && !d.pending_review) return false;
    if (filterFolder === "__unfiled" && !tree.isUnfiled(d)) return false;
    if (filterScope && (!d.folder_id || !filterScope.has(d.folder_id))) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const isFiltering = search.trim() !== "" || filterFolder !== "__all";
  const docsVisible = showAllDocs || isFiltering;

  function rowActions(d: PrivateDoc): (RowAction | false)[] {
    const blocked = quarantineReason(d);
    const noFile = d.storage_path ? undefined : "No file attached to this document";
    return [
      d.pending_review &&
        !blocked && {
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
        disabledReason: blockedReason(blocked),
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
        title: noFile,
        disabledReason: blockedReason(blocked),
        onSelect: () => onView(d.id, d.name),
      },
      {
        key: "download",
        label: "Download",
        icon: Download,
        disabled: !d.storage_path,
        title: noFile,
        disabledReason: blockedReason(blocked),
        onSelect: () => onDownload(d.id),
      },
      {
        key: "move",
        label: "Move to another folder",
        icon: FolderInput,
        onSelect: () => setMoveFor(d),
      },
      hasCopyTargets && {
        key: "copy",
        label: "Copy to agency shared folder",
        icon: Share2,
        disabled: !d.storage_path,
        title: noFile,
        disabledReason: blockedReason(blocked),
        onSelect: () => setCopyFor({ id: d.id, name: d.name }),
      },
      {
        key: "share",
        label: `Share with a ${SHARE_RECIPIENT_TERM}`,
        icon: Share2,
        disabledReason: blockedReason(blocked),
        onSelect: () => navigate({ to: "/talent/sharing", search: { doc: d.id } }),
      },
      {
        key: "delete",
        label: "Delete document",
        icon: Trash2,
        destructive: true,
        separatorBefore: true,
        onSelect: () => onDeleteDoc(d.id, d.name),
      },
    ];
  }

  function statusPills(d: PrivateDoc) {
    const blocked = quarantineReason(d);
    if (blocked) return <BlockedDocumentPill reason={blocked} />;
    const pills: React.ReactNode[] = [];
    if (needsFiling(d, tree.isUnfiled(d)))
      pills.push(
        <span key="file" className="tvp-status tvp-purple">
          Needs filing
        </span>,
      );
    if (expiresSoon(d.expires_at, expiryNoticeDays))
      pills.push(
        <span key="exp" className="tvp-status tvp-amber">
          Expires soon
        </span>,
      );
    return pills.length ? <span className="tv-doc-pills">{pills}</span> : null;
  }

  function viewButton(d: PrivateDoc) {
    const blocked = quarantineReason(d);
    return (
      <button
        type="button"
        className="tvp-secondary tv-btn-sm"
        disabled={!d.storage_path || !!blocked}
        title={blockedReason(blocked) ?? (d.storage_path ? undefined : "No file attached")}
        onClick={() => onView(d.id, d.name)}
      >
        <Eye className="h-4 w-4" /> View
      </button>
    );
  }

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
        <p className="tvp-warn">
          {friendlyError(error, "This page could not be loaded. Please try again.")}
        </p>
      </div>
    );
  }

  // ---- Inside a folder (or the Unfiled set) ----------------------------------
  let folderView: React.ReactNode = null;
  if (!docsVisible && place.kind !== "grid") {
    const category = place.kind === "folder" ? tree.byId.get(place.categoryId) : undefined;
    if (place.kind === "folder" && !category) {
      // The folder was removed meanwhile; the effect above returns to the grid.
    } else {
      const subs = category ? tree.childrenOf(category.id) : [];
      const subFolder =
        place.kind === "folder" && place.sub !== "all" && place.sub !== "direct"
          ? tree.byId.get(place.sub)
          : undefined;
      const inView: PrivateDoc[] =
        place.kind === "unfiled"
          ? tree.unfiled
          : place.sub === "all"
            ? tree.docsIn(category!.id)
            : place.sub === "direct"
              ? tree.directDocs(category!.id)
              : subFolder
                ? tree.docsIn(subFolder.id)
                : [];
      const title =
        place.kind === "unfiled"
          ? "Unfiled"
          : subFolder
            ? subFolder.name
            : place.kind === "folder" && place.sub === "direct"
              ? `In ${category!.name}`
              : category!.name;
      const uploadTarget =
        place.kind === "unfiled" ? null : subFolder ? subFolder.id : category!.id;
      folderView = (
        <FolderDocuments
          key={`${place.kind}:${place.kind === "folder" ? `${place.categoryId}:${place.sub}` : ""}`}
          crumbs={
            <nav className="tvp-breadcrumb tvp-vault-breadcrumb" aria-label="Folder path">
              <button
                type="button"
                className="tvp-crumb"
                onClick={() => setPlace({ kind: "grid" })}
              >
                All folders
              </button>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              {place.kind === "unfiled" ? (
                <strong aria-current="page">Unfiled</strong>
              ) : (
                <>
                  {subFolder || place.sub === "direct" ? (
                    <button
                      type="button"
                      className="tvp-crumb"
                      onClick={() =>
                        setPlace({ kind: "folder", categoryId: category!.id, sub: "all" })
                      }
                    >
                      {category!.name}
                    </button>
                  ) : (
                    <strong aria-current="page">{category!.name}</strong>
                  )}
                  {(subFolder || place.sub === "direct") && (
                    <>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      <strong aria-current="page">
                        {subFolder ? subFolder.name : "In this folder"}
                      </strong>
                    </>
                  )}
                </>
              )}
            </nav>
          }
          title={title}
          meta={
            place.kind === "unfiled"
              ? `${plural(inView.length, "document")} waiting to be filed`
              : `In ${category!.name} · ${plural(inView.length, "document")}`
          }
          headerActions={
            <>
              {subFolder && inView.length === 0 && tree.childrenOf(subFolder.id).length === 0 && (
                <button
                  type="button"
                  className="tvp-mini-btn"
                  title="Delete this empty subfolder"
                  aria-label="Delete this empty subfolder"
                  onClick={() => onDeleteFolder(subFolder.id, subFolder.name, false)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                className="tvp-secondary"
                onClick={() => triggerUpload(uploadTarget)}
              >
                <Upload className="h-4 w-4" /> Upload here
              </button>
            </>
          }
          chips={
            place.kind === "folder" && (subs.length > 0 || tree.directDocs(category!.id).length) ? (
              <div className="tvp-subfolder-list" role="group" aria-label="Show">
                <button
                  type="button"
                  className={`tvp-subfolder-pill${place.sub === "all" ? " tvp-active" : ""}`}
                  aria-pressed={place.sub === "all"}
                  onClick={() => setPlace({ kind: "folder", categoryId: category!.id, sub: "all" })}
                >
                  All in {category!.name}
                  <span className="tv-chip-count">{tree.docsIn(category!.id).length}</span>
                </button>
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`tvp-subfolder-pill${place.sub === s.id ? " tvp-active" : ""}`}
                    aria-pressed={place.sub === s.id}
                    onClick={() => setPlace({ kind: "folder", categoryId: category!.id, sub: s.id })}
                  >
                    {s.name}
                    <span className="tv-chip-count">{tree.docsIn(s.id).length}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`tvp-subfolder-pill${place.sub === "direct" ? " tvp-active" : ""}`}
                  aria-pressed={place.sub === "direct"}
                  onClick={() =>
                    setPlace({ kind: "folder", categoryId: category!.id, sub: "direct" })
                  }
                >
                  In this folder
                  <span className="tv-chip-count">{tree.directDocs(category!.id).length}</span>
                </button>
              </div>
            ) : null
          }
          docs={inView}
          showFolderColumn={false}
          pathOf={tree.pathOf}
          statusPills={statusPills}
          viewButton={viewButton}
          rowActions={rowActions}
          emptyText={
            place.kind === "unfiled"
              ? "Everything is filed."
              : "No documents here yet. Use Upload here to add one."
          }
        />
      );
    }
  }

  return (
    <>
      {confirmDialog}
      <input ref={fileInput} type="file" hidden onChange={onFilePicked} />

      <VaultToolbar
        search={search}
        onSearch={setSearch}
        folder={{
          key: "folder",
          label: "Folder",
          value: filterFolder,
          options: [
            { value: "__all", label: "All folders" },
            { value: "__unfiled", label: "Unfiled", count: tree.unfiled.length || undefined },
            { value: "__pending", label: "Pending review", count: pendingCount || undefined },
            ...tree.categories.map((x) => ({ value: x.id, label: x.name })),
          ],
        }}
        onFolder={setFilterFolder}
        showAll={docsVisible}
        onShowAll={(v) => {
          setShowAllDocs(v);
          if (!v) {
            setSearch("");
            setFilterFolder("__all");
          }
        }}
      />

      {!docsVisible && place.kind === "grid" && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Private Vault folders</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {plural(tree.categories.length, "folder")} · {plural(documents.length, "document")}.
                Choose which folders appear in Settings › Manage folders.
              </p>
            </div>
          </div>

          {tree.categories.length === 0 && tree.unfiled.length === 0 ? (
            documents.length === 0 ? (
              <EmptyState icon={<Lock />} tint="teal" title="No folders switched on yet">
                Turn folders on under Settings › Manage folders, or upload a document to start.
              </EmptyState>
            ) : null
          ) : (
            <div className="tvp-folder-tree tv-vault-grid">
              {tree.unfiled.length > 0 && (
                <div className="tvp-folder-card tv-unfiled-card">
                  <div className="tvp-folder-head tv-folder-head-static">
                    <span className="tvp-kpi-icon tvp-bg-purple" style={{ width: 40, height: 40 }}>
                      <Inbox className="h-4 w-4" />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="tvp-folder-name" style={{ display: "block" }}>
                        Unfiled
                      </span>
                      <span className="tvp-folder-meta" style={{ display: "block" }}>
                        {plural(tree.unfiled.length, "document")}
                      </span>
                      <span className="tvp-folder-flags">
                        <span className="tvp-status tvp-purple">
                          {tree.unfiled.length} to file
                        </span>
                      </span>
                    </span>
                    <span className="tv-folder-head-actions">
                      <button
                        type="button"
                        className="tvp-secondary tv-btn-sm"
                        onClick={() => setPlace({ kind: "unfiled" })}
                      >
                        <FolderOpen className="h-4 w-4" /> Open
                      </button>
                      <button type="button" className="tvp-secondary tv-btn-sm" onClick={organise}>
                        <Sparkles className="h-4 w-4" /> Organise
                      </button>
                    </span>
                  </div>
                </div>
              )}

              {tree.categories.map((f) => {
                const subs = tree.childrenOf(f.id);
                const all = tree.docsIn(f.id);
                const direct = tree.directDocs(f.id);
                const expiring = all.filter((d) => expiresSoon(d.expires_at, expiryNoticeDays));
                const toFile = all.filter((d) => d.pending_review);
                const open = openCards.has(f.id);
                return (
                  <div key={f.id} className={`tvp-folder-card${open ? " tvp-open" : ""}`}>
                    <button
                      type="button"
                      className="tvp-folder-head"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenCards((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        })
                      }
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
                          {plural(all.length, "document")}
                          {subs.length > 0 && ` · ${plural(subs.length, "subfolder")}`}
                        </span>
                        {(expiring.length > 0 || toFile.length > 0) && (
                          <span className="tvp-folder-flags">
                            {expiring.length > 0 && (
                              <span className="tvp-status tvp-amber">
                                {expiring.length} expiring soon
                              </span>
                            )}
                            {toFile.length > 0 && (
                              <span className="tvp-status tvp-purple">{toFile.length} to file</span>
                            )}
                          </span>
                        )}
                      </span>
                      <ChevronDown className="h-4 w-4 tvp-folder-chevron" />
                    </button>
                    <div className="tvp-folder-body">
                      <div>
                        <div className="tvp-folder-body-inner">
                          <button
                            type="button"
                            className="tvp-secondary"
                            style={{ justifyContent: "flex-start" }}
                            onClick={() =>
                              setPlace({ kind: "folder", categoryId: f.id, sub: "all" })
                            }
                          >
                            <FolderOpen className="h-4 w-4" /> Open all{" "}
                            {plural(all.length, "document")}
                          </button>
                          <div className="tvp-subfolder-list">
                            {subs.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className="tvp-subfolder-pill"
                                onClick={() =>
                                  setPlace({ kind: "folder", categoryId: f.id, sub: s.id })
                                }
                              >
                                {s.name}
                                <span className="tv-chip-count">{tree.docsIn(s.id).length}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="tvp-subfolder-pill"
                              onClick={() =>
                                setPlace({ kind: "folder", categoryId: f.id, sub: "direct" })
                              }
                            >
                              In this folder
                              <span className="tv-chip-count">{direct.length}</span>
                            </button>
                          </div>
                          <div className="tvp-footer-actions" style={{ marginTop: 2 }}>
                            <button
                              type="button"
                              title="Remove folder — hidden, restorable from Settings"
                              className="tvp-mini-btn"
                              onClick={() => onDeleteFolder(f.id, f.name, true)}
                              aria-label={`Remove ${f.name} (restorable)`}
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

      {folderView}

      {docsVisible && (
        <FolderDocuments
          title="All private documents"
          meta={
            filteredDocs.length === documents.length
              ? `${plural(filteredDocs.length, "document")} across all folders`
              : `${filteredDocs.length} of ${plural(documents.length, "document")} match`
          }
          docs={filteredDocs}
          showFolderColumn
          pathOf={tree.pathOf}
          statusPills={statusPills}
          viewButton={viewButton}
          rowActions={rowActions}
          resetKey={`${filterFolder}|${search}`}
          empty={
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
                No documents match your search or folder filter. Clear them to see everything.
              </EmptyState>
            )
          }
        />
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

      {moveFor && (
        <MoveDocumentDialog
          doc={moveFor}
          folders={folders}
          pathOf={tree.pathOf}
          onClose={() => setMoveFor(null)}
          onMoved={() => {
            setMoveFor(null);
            invalidate();
          }}
        />
      )}
    </>
  );
}

function FolderDocuments({
  crumbs,
  title,
  meta,
  headerActions,
  chips,
  docs,
  showFolderColumn,
  pathOf,
  statusPills,
  viewButton,
  rowActions,
  emptyText,
  empty,
  resetKey,
}: {
  crumbs?: React.ReactNode;
  title: string;
  meta: string;
  headerActions?: React.ReactNode;
  chips?: React.ReactNode;
  docs: PrivateDoc[];
  showFolderColumn: boolean;
  pathOf: (id: string | null) => string | null;
  statusPills: (d: PrivateDoc) => React.ReactNode;
  viewButton: (d: PrivateDoc) => React.ReactNode;
  rowActions: (d: PrivateDoc) => (RowAction | false)[];
  emptyText?: string;
  empty?: React.ReactNode;
  resetKey?: string;
}) {
  const page = usePagedList(docs, { resetKey: resetKey ?? title });
  const cols = showFolderColumn ? 5 : 6;
  return (
    <>
      {crumbs}
      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="tvp-h2">{title}</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {meta}
            </p>
          </div>
          {headerActions && <div className="tv-panel-actions">{headerActions}</div>}
        </div>
        {chips && <div style={{ marginBottom: 14 }}>{chips}</div>}
        {docs.length === 0 ? (
          (empty ?? (
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              {emptyText}
            </p>
          ))
        ) : (
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Document</th>
                  {showFolderColumn ? <th>Folder</th> : <th>Size</th>}
                  <th>Uploaded</th>
                  <th>Expires</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.visible.map((d) => {
                  const path = pathOf(d.folder_id);
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="tv-doc-name">
                          <FileTypeIcon name={d.name} />
                          <strong>{d.name}</strong>
                        </span>
                        {statusPills(d)}
                      </td>
                      {showFolderColumn ? (
                        <td>
                          {path ?? <span className="tvp-status tvp-purple">Unfiled</span>}
                        </td>
                      ) : (
                        <td>{d.size_bytes ? formatBytes(d.size_bytes) : "—"}</td>
                      )}
                      <td>{fmtDate(d.created_at)}</td>
                      <td>{fmtDate(d.expires_at)}</td>
                      <td>
                        <div className="tvp-row-actions">
                          {viewButton(d)}
                          <RowActionsMenu actions={rowActions(d)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <LoadMoreRow
                  colSpan={cols}
                  noun="documents"
                  shown={page.shown}
                  total={page.total}
                  hasMore={page.hasMore}
                  onLoadMore={page.loadMore}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** Search + folder filter + By folder / All documents switch, one card. */
function VaultToolbar({
  search,
  onSearch,
  folder,
  onFolder,
  showAll,
  onShowAll,
}: {
  search: string;
  onSearch: (v: string) => void;
  folder: FilterDef;
  onFolder: (v: string) => void;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
}) {
  return (
    <div className="tvp-card tv-filter-card">
      <FilterBar
        search={{
          value: search,
          onChange: onSearch,
          label: "Search",
          placeholder: "Search private documents",
        }}
        filters={[folder]}
        onChange={(_, v) => onFolder(v)}
      />
      <div className="tv-seg" role="tablist" aria-label="Private vault view">
        <button
          type="button"
          role="tab"
          aria-selected={!showAll}
          className={!showAll ? "tvp-active" : ""}
          onClick={() => onShowAll(false)}
        >
          <Folder className="h-4 w-4" aria-hidden="true" /> By folder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showAll}
          className={showAll ? "tvp-active" : ""}
          onClick={() => onShowAll(true)}
        >
          <FileStack className="h-4 w-4" aria-hidden="true" /> All documents
        </button>
      </div>
    </div>
  );
}

function MoveDocumentDialog({
  doc,
  folders,
  pathOf,
  onClose,
  onMoved,
}: {
  doc: PrivateDoc;
  folders: PrivateFolder[];
  pathOf: (id: string | null) => string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const move = useServerFn(movePrivateDocument);
  const [target, setTarget] = useState<string>(doc.folder_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = folders
    .map((f) => ({ id: f.id, label: pathOf(f.id) ?? f.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  async function onMove() {
    setBusy(true);
    setError(null);
    try {
      await move({ data: { id: doc.id, folder_id: target || null } });
      toast.success("Document moved.");
      onMoved();
    } catch (e) {
      setError(friendlyError(e, "The document couldn't be moved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth={480} labelledBy="tvp-move-title">
      <div className="tvp-modal-head">
        <h2 className="tvp-h2" id="tvp-move-title">
          Move {doc.name}
        </h2>
        <button
          type="button"
          className="tvp-mini-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="tvp-modal-body">
        <div className="tvp-form-group">
          <label htmlFor="tvp-move-folder">Folder</label>
          <select
            id="tvp-move-folder"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Unfiled</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="tvp-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="tvp-modal-foot">
        <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="tvp-primary"
          disabled={busy || target === (doc.folder_id ?? "")}
          onClick={onMove}
        >
          {busy ? "Moving…" : "Move document"}
        </button>
      </div>
    </ModalShell>
  );
}

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
    } catch (e) {
      setError(friendlyError(e, "The document couldn't be copied."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth={520} labelledBy="tvp-copy-title">
      <div className="tvp-modal-head">
        <h2 className="tvp-h2" id="tvp-copy-title">
          Copy to agency shared folder
        </h2>
        <button
          type="button"
          className="tvp-mini-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="tvp-modal-body">
        <p className="tvp-muted">
          {copyConfirmText(documentName, target?.agency_name ?? "your agency")}
        </p>

        {usable.length > 1 && (
          <div className="tvp-form-group">
            <label htmlFor="tvp-copy-agency">Agency</label>
            <select
              id="tvp-copy-agency"
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

        <div className="tvp-form-group">
          <label htmlFor="tvp-copy-folder">Folder</label>
          <select
            id="tvp-copy-folder"
            value={folder}
            aria-describedby="tvp-copy-folder-hint"
            onChange={(e) => setFolder(e.target.value)}
          >
            <option value="">Choose a folder…</option>
            {(target?.folders ?? []).map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <span id="tvp-copy-folder-hint" className="tvp-field-hint">
            Your agency sets up these folders.
          </span>
        </div>

        <label className="tvp-modal-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I understand I can’t remove the copy once it’s shared with my agency.</span>
        </label>

        {error && (
          <p className="tvp-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="tvp-modal-foot">
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
