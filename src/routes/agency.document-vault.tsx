import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Upload, FolderOpen, Sparkles, FileText, Trash2, Download, Eye, X, Info, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyVaultDocuments,
  listAgencyTalentLinksLite,
  registerAgencyVaultDocument,
  getAgencyVaultSignedUrl,
  deleteAgencyVaultDocument,
  agencyWhoami,
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
};
type TalentLinkLite = { id: string; displayName: string };

const docsQO = queryOptions({
  queryKey: ["agency", "vault", "docs"],
  queryFn: () => listAgencyVaultDocuments() as Promise<VaultDoc[]>,
});
const talentLinksQO = queryOptions({
  queryKey: ["agency", "vault", "talent-links"],
  queryFn: () => listAgencyTalentLinksLite() as Promise<TalentLinkLite[]>,
});
const meQO = queryOptions({
  queryKey: ["agency", "whoami"],
  queryFn: () => agencyWhoami(),
});

export const Route = createFileRoute("/agency/document-vault")({
  head: () => ({ meta: [{ title: "Document Vault · TalVault Agency" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(docsQO),
      context.queryClient.ensureQueryData(talentLinksQO),
      context.queryClient.ensureQueryData(meQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Document Vault</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: VaultPage,
});

const tabs = ["All Documents", "Needs Review", "Expiring", "Recently Updated"] as const;
type Tab = typeof tabs[number];

const FOLDER_OPTIONS = ["Contracts", "ID Documents", "Travel", "Tax", "Other"];

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

function VaultPage() {
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
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Document Vault</h1>
          <div className="tvp-subtitle">Agency-visible documents across Talent Shared Folders.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><FolderOpen className="h-4 w-4" />Browse folders</button>
          <button className="tvp-primary" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" />Upload to Talent
          </button>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>Talent Private Vault remains private.</strong> Only documents intentionally placed in an Agency Shared Folder appear here.
        </div>
      </div>

      <div className="tvp-tabs">
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
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <FileText className="inline h-4 w-4 mr-2 text-[var(--tvp-muted)]" />
                      <strong>{d.name}</strong>
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
                          title="View / download"
                          disabled={!d.storagePath || openMut.isPending}
                          onClick={() => openMut.mutate(d.id)}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          className="tvp-mini-btn"
                          title="Delete"
                          disabled={deleteMut.isPending}
                          onClick={() => {
                            if (confirm(`Delete "${d.name}"? This removes the file and the record.`)) {
                              deleteMut.mutate(d.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Expiring soon</h2>
            {expiring.length === 0 ? (
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 8 }}>
                Nothing expiring in the next 180 days.
              </p>
            ) : (
              <div className="tvp-list">
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
    </>
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
  talentLinks: { id: string; displayName: string }[];
  onClose: () => void;
  onDone: () => void;
  registerFn: ReturnType<typeof useServerFn<typeof registerAgencyVaultDocument>>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [talentLinkId, setTalentLinkId] = useState<string>(talentLinks[0]?.id ?? "");
  const [folder, setFolder] = useState<string>(FOLDER_OPTIONS[0]);
  const [status, setStatus] = useState<"filed" | "needs_review" | "ai_suggested">("needs_review");
  const [expiry, setExpiry] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Pick a file first");
    if (!agencyId) return toast.error("No agency context");

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
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="tvp-card"
        style={{ width: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">Upload document</h2>
        <label className="tvp-muted" style={{ fontSize: 13 }}>File</label>
        <input ref={fileRef} type="file" required />

        <label className="tvp-muted" style={{ fontSize: 13 }}>Talent</label>
        <select className="tvp-select" value={talentLinkId} onChange={(e) => setTalentLinkId(e.target.value)}>
          <option value="">Unassigned</option>
          {talentLinks.map((l) => <option key={l.id} value={l.id}>{l.displayName}</option>)}
        </select>

        <label className="tvp-muted" style={{ fontSize: 13 }}>Folder</label>
        <select className="tvp-select" value={folder} onChange={(e) => setFolder(e.target.value)}>
          {FOLDER_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        <label className="tvp-muted" style={{ fontSize: 13 }}>Status</label>
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
