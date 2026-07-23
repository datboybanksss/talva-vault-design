import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRosterSharedContents, getSharedDocumentDownloadUrl } from "@/lib/talent.functions";
import {
  listPrivateVault,
  createPrivateFolder,
  renamePrivateFolder,
  deletePrivateFolder,
  createPrivateUploadUrl,
  getPrivateDocumentDownloadUrl,
  deletePrivateDocument,
} from "@/lib/talent-vault.functions";
import { toast } from "sonner";
import {
  Plus, Upload, Lock, FileStack, Sparkles, Info, Download, FolderOpen,
  Folder, Pencil, Trash2, MoreVertical,
} from "lucide-react";

export const Route = createFileRoute("/talent/vault")({
  head: () => ({ meta: [{ title: "Vault · TalVault Talent" }] }),
  component: VaultPage,
});


type Mode = "private" | "agency" | "review";

function VaultPage() {
  const [mode, setMode] = useState<Mode>("private");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Vault</h1>
          <div className="tvp-subtitle">
            One vault area with clear separation between Private Vault, Roster Shared Folder and AI Review.
          </div>
        </div>
      </div>

      <div className="tvp-tabs">
        <button className={`tvp-tab${mode === "private" ? " tvp-active" : ""}`} onClick={() => setMode("private")}>
          <Lock className="h-4 w-4" /> Private Vault
        </button>
        <button className={`tvp-tab${mode === "agency" ? " tvp-active" : ""}`} onClick={() => setMode("agency")}>
          <FileStack className="h-4 w-4" /> Roster Shared Folder
        </button>
        <button className={`tvp-tab${mode === "review" ? " tvp-active" : ""}`} onClick={() => setMode("review")}>
          <Sparkles className="h-4 w-4" /> AI Review
        </button>
      </div>

      {mode === "private" && <PrivateVault />}

      {mode === "agency" && <RosterSharedFolder />}




      {mode === "review" && (
        <div className="tvp-two-col">
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Passport.pdf</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
              AI detected a possible folder, subfolder, expiry date and reminder date. The Talent must validate these before filing.
            </p>
            <div className="tvp-preview-box">Secure document preview</div>
          </div>
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">AI Suggestions</h2>

            <div className="tvp-sub-card">
              <h3 className="tvp-h3">Suggested Folder & Subfolder</h3>
              <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                <strong>Private Vault:</strong> Personal → Passport<br />
                <strong>Agency Shared, if shared:</strong> Travel → Passport
              </p>
              <div className="tvp-footer-actions">
                <button className="tvp-secondary">Choose different folder</button>
                <button className="tvp-primary">Confirm Folder</button>
              </div>
            </div>

            <div className="tvp-sub-card">
              <h3 className="tvp-h3">Suggested Expiry & Reminder</h3>
              <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                Detected expiry date: <strong>14 May 2031</strong><br />
                Suggested reminder: <strong>90 days before expiry</strong>
              </p>
              <div className="tvp-footer-actions">
                <button className="tvp-secondary">No reminder</button>
                <button className="tvp-primary">Confirm Expiry & Reminder</button>
              </div>
            </div>

            <div className="tvp-callout" style={{ background: "#FFF7ED", borderColor: "#F6C99D" }}>
              <div className="tvp-callout-icon" style={{ background: "var(--tvp-amber-bg)", color: "var(--tvp-amber)" }}>
                <Info className="h-4 w-4" />
              </div>
              <div>
                <strong>Human validation required.</strong>{" "}
                <span className="tvp-muted">AI suggestions are never final until the Talent confirms or edits them.</span>
              </div>
            </div>

            <div className="tvp-footer-actions">
              <button className="tvp-secondary">Reject AI Suggestion</button>
              <button className="tvp-primary">Save Confirmed Filing</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FolderTree({ folders }: { folders: FolderDef[] }) {
  return (
    <div className="tvp-folder-tree">
      {folders.map((f) => {
        const groups = f.groups ?? [{ label: "", subs: f.subs ?? [] }];
        const total = groups.reduce((n, g) => n + g.subs.length, 0);
        const isGrouped = !!f.groups;
        return (
          <div key={f.name} className="tvp-folder-card">
            <h3>
              <span className={`tvp-kpi-icon tvp-bg-${f.tone}`} style={{ width: 34, height: 34 }}>
                <f.Icon className="h-4 w-4" />
              </span>
              {f.name}
              <span className="tvp-folder-count">{total} SUBFOLDERS</span>
            </h3>
            <div className="tvp-folder-eyebrow">Recommended subfolders</div>
            {isGrouped ? (
              <div className="tvp-subfolder-groups">
                {groups.map((g) => (
                  <div key={g.label} className="tvp-subfolder-group">
                    <div className="tvp-subfolder-group-label">{g.label}</div>
                    <div className="tvp-subfolder-list">
                      {g.subs.map((s) => <span key={s} className="tvp-subfolder-pill">{s}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tvp-subfolder-list">
                {groups[0].subs.map((s) => <span key={s} className="tvp-subfolder-pill">{s}</span>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusTone(status: string) {
  switch (status) {
    case "approved": return "green";
    case "needs_review": return "purple";
    case "resubmission_required": return "amber";
    case "cancelled": return "red";
    default: return "blue";
  }
}

function RosterSharedFolder() {
  const load = useServerFn(getRosterSharedContents);
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
    return <div className="tvp-card tvp-panel"><p className="tvp-muted">Loading Roster Shared Folder…</p></div>;
  }
  if (isError) {
    return <div className="tvp-card tvp-panel"><p className="tvp-warn">Failed to load: {(error as Error)?.message}</p></div>;
  }
  if (!data?.link) {
    return (
      <div className="tvp-card tvp-panel">
        <h2 className="tvp-h2">No active roster link</h2>
        <p className="tvp-muted" style={{ marginTop: 6 }}>
          You aren't currently linked to a Talent Manager. Once you're invited and accepted, the Roster Shared Folder appears here.
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
      <div className="tvp-callout">
        <div className="tvp-callout-icon"><FileStack className="h-4 w-4" /></div>
        <div>
          <strong>Manager-controlled folder structure.</strong>{" "}
          <span className="tvp-muted">
            Your Talent Manager defines the folders in the Roster Shared Folder. You can view and download documents here, but the folder structure itself is read-only for Talent.
          </span>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <div>
            <h2 className="tvp-h2">Roster Shared Folder</h2>
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
            {folders.map((f) => {
              const count = data.documents.filter((d) => d.folder === f.folder_name).length;
              return (
                <div key={f.id} className="tvp-folder-card">
                  <h3>
                    <span className="tvp-kpi-icon tvp-bg-blue" style={{ width: 34, height: 34 }}>
                      <FolderOpen className="h-4 w-4" />
                    </span>
                    {f.folder_name}
                    <span className="tvp-folder-count">{count} DOC{count === 1 ? "" : "S"}</span>
                  </h3>
                  {f.retention_years != null && (
                    <div className="tvp-folder-eyebrow">Retention: {f.retention_years} year{f.retention_years === 1 ? "" : "s"}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="tvp-card" style={{ marginTop: 22 }}>
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search Roster Shared Folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="tvp-row-actions">
            <select className="tvp-select" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
              <option value="__all">Folder: All</option>
              {folders.map((f) => <option key={f.id} value={f.folder_name}>{f.folder_name}</option>)}
            </select>
          </div>
        </div>
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


