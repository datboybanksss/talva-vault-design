import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Upload, FolderOpen, Sparkles, FileText, Trash2, Download, Eye, X, Loader2,
  Lock, History, ShieldPlus, FileSignature, Award, Receipt, IdCard, Users as UsersIcon, HeartPulse, Landmark, AlertTriangle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyVaultDocuments,
  listAgencyTalentLinksLite,
  listAgencyTalentFolders,
  registerAgencyVaultDocument,
  getAgencyVaultSignedUrl,
  deleteAgencyVaultDocument,
  agencyWhoami,
  listAgencyDocumentVersions,
  registerAgencyDocumentVersion,
  getAgencyVersionSignedUrl,
  upsertAgencyRetentionRule,
} from "@/lib/agency.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type VaultDoc = {
  id: string;
  name: string;
  folder: string;
  status: string;
  validityExpiresAt: string | null;
  storagePath: string | null;
  talentLinkId: string | null;
  talentName: string;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lockedUntil: string | null;
  currentVersionId: string | null;
};
type TalentLinkLite = { id: string; displayName: string; status: string };

export const docsQO = queryOptions({
  queryKey: ["agency", "vault", "docs"],
  queryFn:  () => listAgencyVaultDocuments() as Promise<VaultDoc[]>,
});
export const talentLinksQO = queryOptions({
  queryKey: ["agency", "vault", "talent-links"],
  queryFn:  () => listAgencyTalentLinksLite() as Promise<TalentLinkLite[]>,
});
export const meQO = queryOptions({
  queryKey: ["agency", "whoami"],
  queryFn:  () => agencyWhoami(),
});

export const Route = createFileRoute("/agency/document-vault")({
  head: () => ({ meta: [{ title: "Roster Shared Folder · TalVault" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(docsQO),
      context.queryClient.ensureQueryData(talentLinksQO),
      context.queryClient.ensureQueryData(meQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Roster Shared Folder</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: VaultPage,
});

const tabs = ["All Documents", "Needs Review", "Expiring", "Recently Updated"] as const;
type Tab = typeof tabs[number];

const FOLDER_OPTIONS = ["Contracts", "Endorsements", "Invoices", "ID Documents", "Travel", "Tax", "Other"];

type FolderMeta = {
  key: string;
  label: string;
  description: string;
  icon: any;
};
const ALLOWED_FOLDERS: FolderMeta[] = [
  { key: "Contracts", label: "Contracts", description: "Agreements, riders, addenda", icon: FileSignature },
  { key: "Endorsements", label: "Endorsements", description: "Brand deals, partnerships", icon: Award },
  { key: "Invoices", label: "Invoices", description: "Billing documents shared with talent", icon: Receipt },
  { key: "ID Documents", label: "ID Documents", description: "Passport, visa, work authorisation", icon: IdCard },
];
const BLOCKED_FOLDERS: FolderMeta[] = [
  { key: "family", label: "Family / Loved Ones", description: "Talent's personal contacts", icon: UsersIcon },
  { key: "medical", label: "Medical / Insurance", description: "Health records, insurance", icon: HeartPulse },
  { key: "finance", label: "Personal Finance", description: "Bank statements, taxes", icon: Landmark },
];

function statusTone(status: string): "purple" | "green" | "amber" {
  if (status === "ai_suggested") return "purple";
  if (status === "filed") return "green";
  return "amber";
}
function statusLabel(status: string): string {
  if (status === "ai_suggested") return "AI suggested";
  if (status === "filed") return "Filed";
  return "Needs review";
}
function formatValidity(iso: string | null): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return `Expires ${d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

export function VaultPage() {
  const qc = useQueryClient();
  const { data: docs } = useSuspenseQuery(docsQO);
  const { data: talentLinks } = useSuspenseQuery(talentLinksQO);
  const { data: me } = useSuspenseQuery(meQO);

  const [tab, setTab] = useState<Tab>("All Documents");
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [talentFilter, setTalentFilter] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [versionsFor, setVersionsFor] = useState<VaultDoc | null>(null);
  const [newVersionFor, setNewVersionFor] = useState<VaultDoc | null>(null);
  const [overrideFor, setOverrideFor] = useState<VaultDoc | null>(null);

  const isOwner = me?.role === "owner";
  const upsertRuleFn = useServerFn(upsertAgencyRetentionRule);

  const registerFn = useServerFn(registerAgencyVaultDocument);
  const signedFn = useServerFn(getAgencyVaultSignedUrl);
  const deleteFn = useServerFn(deleteAgencyVaultDocument);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["agency", "vault"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const viewMut = useMutation({
    mutationFn: (id: string) => signedFn({ data: { id, disposition: "inline" } }),
    onSuccess: ({ url, name }) => setPreview({ url, name }),
    onError: (e: any) => toast.error(e?.message ?? "Could not open file"),
  });

  const downloadMut = useMutation({
    mutationFn: (id: string) => signedFn({ data: { id, disposition: "attachment" } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
    onError: (e: any) => toast.error(e?.message ?? "Could not download file"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (folderFilter !== "all" && d.folder !== folderFilter) return false;
      if (talentFilter !== "all" && d.talentLinkId !== talentFilter) return false;
      if (q && !(d.name.toLowerCase().includes(q) || d.talentName.toLowerCase().includes(q))) return false;
      if (tab === "Needs Review" && d.status !== "needs_review") return false;
      if (tab === "Expiring") {
        const dd = daysUntil(d.validityExpiresAt);
        if (dd === null || dd > 90 || dd < 0) return false;
      }
      if (tab === "Recently Updated") {
        const ageDays = (Date.now() - new Date(d.updatedAt).getTime()) / 86400000;
        if (ageDays > 30) return false;
      }
      return true;
    });
  }, [docs, folderFilter, talentFilter, search, tab]);

  const expiring = useMemo(() => {
    return docs
      .map((d) => ({ ...d, days: daysUntil(d.validityExpiresAt) }))
      .filter((d) => d.days !== null && d.days >= 0 && d.days <= 180)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
      .slice(0, 5);
  }, [docs]);

  return (
    <>
      <div className="tvp-topbar" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="tvp-h1">Roster Shared Folder</h1>
          <div className="tvp-subtitle">Documents shared between you and each talent on your roster. Talent Private Vault items are not shown here.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><FolderOpen className="h-4 w-4" />Browse folders</button>
          <button className="tvp-primary" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" />Upload to Talent
          </button>
        </div>
      </div>

      <div className="tvp-card" style={{ marginBottom: 10, padding: "10px 14px" }}>
        <h2 className="tvp-h2" style={{ marginBottom: 4 }}>Expiring soon</h2>
        {expiring.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13, margin: 0 }}>
            Nothing expiring in the next 180 days.
          </p>
        ) : (
          <div className="tvp-list" style={{ marginTop: 6 }}>
            {expiring.map((d) => (
              <div key={d.id} className="tvp-list-item">
                <FileText className="h-5 w-5 text-[var(--tvp-amber)]" />
                <div>
                  <strong>{d.talentName} · {d.name}</strong>
                  <div className="tvp-muted">{formatValidity(d.validityExpiresAt)}</div>
                </div>
                <span className={`tvp-status tvp-${(d.days ?? 0) <= 60 ? "amber" : "blue"}`}>
                  {d.days} days
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tvp-tabs" style={{ marginTop: 10, marginBottom: 14 }}>
        {tabs.map((t) => (
          <button key={t} className={`tvp-tab${tab === t ? " tvp-active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="tvp-two-col">
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <input
              className="tvp-search"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <select className="tvp-select" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
                <option value="all">Folder: All</option>
                {FOLDER_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="tvp-select" value={talentFilter} onChange={(e) => setTalentFilter(e.target.value)}>
                <option value="all">Talent: All</option>
                {talentLinks.map((l) => <option key={l.id} value={l.id}>{l.displayName}</option>)}
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }} className="tvp-muted">
              No documents match. Upload one with "Upload to Talent".
            </div>
          ) : (
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Talent</th>
                  <th>Folder</th>
                  <th>Status</th>
                  <th>Validity</th>
                  <th style={{ width: 200 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const isLocked = !!d.lockedUntil && new Date(d.lockedUntil).getTime() > Date.now();
                  const lockDate = d.lockedUntil ? new Date(d.lockedUntil).toLocaleDateString() : "";
                  return (
                  <tr key={d.id}>
                    <td>
                      <FileText className="inline h-4 w-4 mr-2 text-[var(--tvp-muted)]" />
                      {d.folder === "Contracts" ? (
                        <Link to="/agency/contracts/$id" params={{ id: d.id }} className="tvp-link">
                          <strong>{d.name}</strong>
                        </Link>
                      ) : (
                        <strong>{d.name}</strong>
                      )}
                      {isLocked && (
                        <span
                          title={`Locked by retention rule until ${lockDate} — cannot be deleted.`}
                          style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4, color: "var(--tvp-amber, #b45309)", fontSize: 12 }}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Locked · {lockDate}
                        </span>
                      )}
                    </td>
                    <td>{d.talentName}</td>
                    <td>{d.folder}</td>
                    <td>
                      <span className={`tvp-status tvp-${statusTone(d.status)}`}>{statusLabel(d.status)}</span>
                    </td>
                    <td className="tvp-muted">{formatValidity(d.validityExpiresAt)}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <button
                          className="tvp-mini-btn"
                          title="View"
                          disabled={!d.storagePath || viewMut.isPending}
                          onClick={() => viewMut.mutate(d.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          className="tvp-mini-btn"
                          title="Download"
                          disabled={!d.storagePath || downloadMut.isPending}
                          onClick={() => downloadMut.mutate(d.id)}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          className="tvp-mini-btn"
                          title="Version history"
                          onClick={() => setVersionsFor(d)}
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          className="tvp-mini-btn"
                          title="Upload new version"
                          onClick={() => setNewVersionFor(d)}
                        >
                          <Upload className="h-4 w-4" />
                        </button>
                        {isOwner && (
                          <button
                            className="tvp-mini-btn"
                            title="Set retention override"
                            onClick={() => setOverrideFor(d)}
                          >
                            <ShieldPlus className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          className="tvp-mini-btn"
                          title={isLocked ? `Locked until ${lockDate}` : "Delete"}
                          disabled={isLocked || deleteMut.isPending}
                          onClick={() => {
                            if (confirm(`Delete "${d.name}"? This removes the file and all versions.`)) {
                              deleteMut.mutate(d.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="tvp-stack">
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">AI Filing Suggestions</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Confirm before filing. Suggestions are never applied automatically.
            </p>
            <div className="tvp-ai-box">
              <strong><Sparkles className="inline h-4 w-4 mr-1" />AI filing coming soon</strong>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Suggestions will appear here once the AI filer is wired up.
              </div>
            </div>
          </div>
        </div>
      </div>

      {showUpload && (
        <UploadDialog
          agencyId={me.agency?.id ?? ""}
          talentLinks={talentLinks}
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            qc.invalidateQueries({ queryKey: ["agency", "vault"] });
          }}
          registerFn={registerFn}
        />
      )}

      {preview && <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}

      {versionsFor && (
        <VersionsDialog
          doc={versionsFor}
          onClose={() => setVersionsFor(null)}
        />
      )}

      {newVersionFor && (
        <NewVersionDialog
          doc={newVersionFor}
          agencyId={me.agency?.id ?? ""}
          onClose={() => setNewVersionFor(null)}
          onDone={() => {
            setNewVersionFor(null);
            qc.invalidateQueries({ queryKey: ["agency", "vault"] });
          }}
        />
      )}

      {overrideFor && (
        <OverrideDialog
          doc={overrideFor}
          onClose={() => setOverrideFor(null)}
          onSave={async (years, description) => {
            try {
              await upsertRuleFn({
                data: {
                  scope: "document",
                  document_id: overrideFor.id,
                  retention_years: years,
                  description: description || null,
                },
              });
              toast.success("Retention override set");
              qc.invalidateQueries({ queryKey: ["agency", "vault"] });
              qc.invalidateQueries({ queryKey: ["agency", "retention"] });
              setOverrideFor(null);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            }
          }}
        />
      )}
    </>
  );
}

function inferKind(name: string): "pdf" | "image" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  return "other";
}

function PreviewDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const kind = inferKind(name);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tvp-card"
        style={{ width: "min(1100px, 100%)", height: "min(85vh, 900px)", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--tvp-border, #e5e7eb)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <FileText className="h-4 w-4 text-[var(--tvp-muted)]" />
            <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
          </div>
          <div className="flex gap-2">
            <a className="tvp-secondary" href={url} target="_blank" rel="noopener" download={name}>
              <Download className="h-4 w-4" />Download
            </a>
            <button className="tvp-mini-btn" title="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, background: "#0f172a08", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {kind === "pdf" && (
            <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: 0, background: "white" }} />
          )}
          {kind === "image" && (
            <img src={url} alt={name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          )}
          {kind === "other" && (
            <div style={{ textAlign: "center", padding: 32 }}>
              <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--tvp-muted)]" />
              <h3 className="tvp-h2">Preview not available</h3>
              <p className="tvp-muted" style={{ marginTop: 6, marginBottom: 16 }}>
                This file type can't be rendered inline in the browser.
              </p>
              <a className="tvp-primary" href={url} target="_blank" rel="noopener" download={name}>
                <Download className="h-4 w-4" />Download to open
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  agencyId,
  talentLinks,
  onClose,
  onDone,
  registerFn,
}: {
  agencyId: string;
  talentLinks: { id: string; displayName: string; status: string }[];
  onClose: () => void;
  onDone: () => void;
  registerFn: ReturnType<typeof useServerFn<typeof registerAgencyVaultDocument>>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [talentLinkId, setTalentLinkId] = useState<string>(
    talentLinks.find((l) => l.status !== "ended")?.id ?? "",
  );
  const [folder, setFolder] = useState<string>("");
  const [status, setStatus] = useState<"filed" | "needs_review" | "ai_suggested">("needs_review");
  const [expiry, setExpiry] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const listFoldersFn = useServerFn(listAgencyTalentFolders);
  const { data: allowedFolders, isLoading: foldersLoading } = useQuery({
    queryKey: ["agency", "vault", "talent-folders", talentLinkId],
    queryFn: () => listFoldersFn({ data: { talent_link_id: talentLinkId } }),
    enabled: !!talentLinkId,
  });

  // Reset folder selection when talent changes
  const folderKeys = (allowedFolders ?? []).map((f: { folderName: string }) => f.folderName).join("|");
  useMemo(() => {
    if (allowedFolders && allowedFolders.length > 0) {
      if (!allowedFolders.find((f: { folderName: string }) => f.folderName === folder)) {
        setFolder(allowedFolders[0].folderName);
      }
    } else {
      setFolder("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderKeys]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Pick a file first");
    if (!agencyId) return toast.error("No agency context");
    if (!talentLinkId) return toast.error("Select a talent");
    if (!folder) return toast.error("Select an allowed destination folder");
    // Guard: folder must be one of the talent's provisioned allowed folders.
    if (!(allowedFolders ?? []).some((f) => f.folderName === folder)) {
      return toast.error("That folder isn't allowed for this talent");
    }

    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${agencyId}/${talentLinkId || "unassigned"}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("talent-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;

      await registerFn({
        data: {
          name: file.name,
          folder,
          storage_path: path,
          talent_link_id: talentLinkId || null,
          status,
          validity_expires_at: expiry ? new Date(expiry).toISOString() : null,
        },
      });
      toast.success("Uploaded");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="tvp-card"
        style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">Upload document to Roster Shared Folder</h2>

        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(180, 83, 9, 0.08)",
            border: "1px solid rgba(180, 83, 9, 0.25)",
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--tvp-amber, #b45309)", marginTop: 2 }} />
          <div style={{ fontSize: 13 }}>
            <strong>Managers can only upload to the Roster Shared Folder.</strong>
            <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
              Talent's Private Vault (Family, Medical, Personal Finance) is shown below as locked so you can see the access boundary — those folders are for the talent only.
            </div>
          </div>
        </div>

        <label className="tvp-muted" style={{ fontSize: 13 }}>File</label>
        <input ref={fileRef} type="file" required />

        <label className="tvp-muted" style={{ fontSize: 13 }}>Talent</label>
        <select className="tvp-select" value={talentLinkId} onChange={(e) => setTalentLinkId(e.target.value)}>
          <option value="">Unassigned</option>
          {talentLinks.map((l) => (
            <option key={l.id} value={l.id} disabled={l.status === "ended"}>
              {l.displayName}{l.status === "ended" ? " (ended — new uploads blocked)" : ""}
            </option>
          ))}
        </select>

        <div className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Destination folder</div>
        <div style={{ fontSize: 12, color: "var(--tvp-muted)", marginTop: -4, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Roster Shared Folder · Allowed
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ALLOWED_FOLDERS.map((f) => {
            const Icon = f.icon;
            const active = folder === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFolder(f.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, textAlign: "left",
                  background: active ? "rgba(37, 99, 235, 0.08)" : "white",
                  border: `1px solid ${active ? "rgba(37, 99, 235, 0.5)" : "var(--tvp-border, #e5e7eb)"}`,
                  cursor: "pointer",
                }}
              >
                <Icon className="h-4 w-4" style={{ color: active ? "#2563eb" : "var(--tvp-muted)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div>
                  <div className="tvp-muted" style={{ fontSize: 12 }}>{f.description}</div>
                </div>
                <span className="tvp-status tvp-green" style={{ fontSize: 11 }}>Allowed</span>
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: "var(--tvp-muted)", marginTop: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Private Vault · Blocked
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: 0.65 }}>
          {BLOCKED_FOLDERS.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.key}
                title="This folder lives in the talent's Private Vault. Managers cannot upload here."
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8,
                  background: "rgba(15, 23, 42, 0.04)",
                  border: "1px dashed var(--tvp-border, #cbd5e1)",
                  cursor: "not-allowed",
                }}
              >
                <Icon className="h-4 w-4 text-[var(--tvp-muted)]" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <Lock className="h-3.5 w-3.5" /> {f.label}
                  </div>
                  <div className="tvp-muted" style={{ fontSize: 12 }}>{f.description}</div>
                </div>
                <span className="tvp-status tvp-amber" style={{ fontSize: 11 }}>Blocked</span>
              </div>
            );
          })}
        </div>

        <label className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Status</label>
        <select className="tvp-select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="needs_review">Needs review</option>
          <option value="filed">Filed</option>
          <option value="ai_suggested">AI suggested</option>
        </select>

        <label className="tvp-muted" style={{ fontSize: 13 }}>Expiry (optional)</label>
        <input className="tvp-select" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />

        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version history dialog
// ---------------------------------------------------------------------------
function VersionsDialog({ doc, onClose }: { doc: VaultDoc; onClose: () => void }) {
  const listFn = useServerFn(listAgencyDocumentVersions);
  const signedFn = useServerFn(getAgencyVersionSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["agency", "vault", "versions", doc.id],
    queryFn: () => listFn({ data: { document_id: doc.id } }),
  });
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  async function open(versionId: string, disposition: "inline" | "attachment") {
    try {
      const { url, name } = await signedFn({ data: { version_id: versionId, disposition } });
      if (disposition === "inline") setPreview({ url, name });
      else window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open version");
    }
  }

  const versions = data?.versions ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tvp-card"
        style={{ width: "min(800px, 100%)", padding: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="tvp-h2">Version history</h2>
            <div className="tvp-muted" style={{ fontSize: 13 }}>{doc.name}</div>
          </div>
          <button className="tvp-mini-btn" onClick={onClose} title="Close"><X className="h-4 w-4" /></button>
        </div>

        {isLoading ? (
          <div className="tvp-muted" style={{ padding: 24, textAlign: "center" }}>
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
          </div>
        ) : versions.length === 0 ? (
          <p className="tvp-muted" style={{ padding: 12 }}>
            Only the current file exists. New uploads under "Upload new version" will appear here.
          </p>
        ) : (
          <table className="tvp-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>File name</th>
                <th>Uploaded</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v: any) => (
                <tr key={v.id}>
                  <td><strong>v{v.version_number}</strong>{data?.currentVersionId === v.id ? " · current" : ""}</td>
                  <td>{v.name}</td>
                  <td className="tvp-muted">{new Date(v.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="tvp-mini-btn" title="View" onClick={() => open(v.id, "inline")}>
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="tvp-mini-btn" title="Download" onClick={() => open(v.id, "attachment")}>
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {preview && <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New version upload dialog
// ---------------------------------------------------------------------------
function NewVersionDialog({
  doc, agencyId, onClose, onDone,
}: { doc: VaultDoc; agencyId: string; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const registerVersion = useServerFn(registerAgencyDocumentVersion);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Pick a file first");
    if (!agencyId) return toast.error("No agency context");

    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${agencyId}/${doc.talentLinkId || "unassigned"}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("talent-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      await registerVersion({
        data: {
          document_id: doc.id,
          storage_path: path,
          name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
        },
      });
      toast.success("New version uploaded");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="tvp-card"
        style={{ width: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">Upload new version</h2>
        <p className="tvp-muted" style={{ fontSize: 13 }}>
          Replacing "{doc.name}" — the previous file is preserved in version history.
        </p>
        <label className="tvp-muted" style={{ fontSize: 13 }}>File</label>
        <input ref={fileRef} type="file" required />
        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload version
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-document retention override dialog
// ---------------------------------------------------------------------------
function OverrideDialog({
  doc, onClose, onSave,
}: {
  doc: VaultDoc;
  onClose: () => void;
  onSave: (years: number, description: string) => Promise<void>;
}) {
  const [years, setYears] = useState<number>(5);
  const [description, setDescription] = useState<string>("");
  const [busy, setBusy] = useState(false);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(Number(years), description); } finally { setBusy(false); } }}
        className="tvp-card"
        style={{ width: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">Set retention override</h2>
        <p className="tvp-muted" style={{ fontSize: 13 }}>
          Locks "{doc.name}" from deletion for the specified number of years from its upload date.
          This overrides any folder-level rule for this document.
        </p>
        <label className="tvp-muted" style={{ fontSize: 13 }}>Retention (years)</label>
        <input
          className="tvp-select"
          type="number"
          min={0}
          max={100}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          required
        />
        <label className="tvp-muted" style={{ fontSize: 13 }}>Description (optional)</label>
        <input
          className="tvp-select"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy}>Set override</button>
        </div>
      </form>
    </div>
  );
}
