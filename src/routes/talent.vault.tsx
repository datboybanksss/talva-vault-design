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

type FolderDef = {
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
  name: string;
  subs?: string[];
  groups?: { label: string; subs: string[] }[];
};

const privateFolders: FolderDef[] = [
  { Icon: User, tone: "teal", name: "Personal", subs: ["ID", "Passport", "Visa", "Driver's License", "Birth Certificate"] },
  { Icon: Baby, tone: "blue", name: "Dependents", subs: ["Birth Certificate", "Vaccine Cards", "School Records", "Bursary Records"] },
  { Icon: HeartPulse, tone: "green", name: "Health", subs: ["Medical Aid Certificate", "Doctor's Referral", "Organ Donor Proof"] },
  {
    Icon: Shield, tone: "purple", name: "Insurance",
    groups: [
      { label: "Property & Vehicle", subs: ["Home Insurance", "Car Insurance"] },
      { label: "Life & Health", subs: ["Life Insurance", "Critical Illness & Disability", "Claim Documents"] },
    ],
  },
  {
    Icon: Landmark, tone: "amber", name: "Tax",
    groups: [
      { label: "Income & Earnings", subs: ["Sponsorship & Endorsement Income", "Prize Money & Appearance Fees", "Royalties & Image Rights"] },
      { label: "Expenses & Deductions", subs: ["Expense Receipts", "Travel Logbook", "Training & Equipment Expenses", "Agent / Manager Commission Invoices"] },
      { label: "Compliance & Filing", subs: ["Provisional Tax (IRP6)", "Income Tax Return (ITR12)", "Tax Clearance Certificate", "Foreign Income & DTA Records", "SARS Correspondence"] },
    ],
  },
  { Icon: PawPrint, tone: "red", name: "Pets", subs: ["Pet Insurance", "Vaccine Record"] },
];

const privateDocs = [
  { name: "Passport.pdf", uploaded: "Uploaded 2h ago", folder: "Personal", sub: "Passport", reminder: "AI suggested", status: "Review AI", statusTone: "purple" },
  { name: "Medical Aid Certificate.pdf", folder: "Health", sub: "Medical Aid Certificate", reminder: "No reminder", status: "Filed", statusTone: "green" },
  { name: "Life Insurance Policy.pdf", folder: "Insurance", sub: "Life Insurance", reminder: "Annual review", status: "Filed", statusTone: "green" },
  { name: "Pet Vaccine Record.pdf", folder: "Pets", sub: "Vaccine Record", reminder: "12 months", status: "Filed", statusTone: "green" },
];

function VaultPage() {
  const [mode, setMode] = useState<Mode>("private");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Vault</h1>
          <div className="tvp-subtitle">
            One vault area with clear separation between Private Vault, Agency Shared Folder and AI Review.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Plus className="h-4 w-4" /> Create Folder</button>
          <button className="tvp-primary"><Upload className="h-4 w-4" /> Upload Document</button>
        </div>
      </div>

      <div className="tvp-tabs">
        <button className={`tvp-tab${mode === "private" ? " tvp-active" : ""}`} onClick={() => setMode("private")}>
          <Lock className="h-4 w-4" /> Private Vault
        </button>
        <button className={`tvp-tab${mode === "agency" ? " tvp-active" : ""}`} onClick={() => setMode("agency")}>
          <FileStack className="h-4 w-4" /> Agency Shared Folder
        </button>
        <button className={`tvp-tab${mode === "review" ? " tvp-active" : ""}`} onClick={() => setMode("review")}>
          <Sparkles className="h-4 w-4" /> AI Review
        </button>
      </div>

      {mode === "private" && (
        <>
          <div className="tvp-callout" style={{ background: "var(--tvp-teal-50)", borderColor: "var(--tvp-teal-200)" }}>
            <div className="tvp-callout-icon" style={{ background: "var(--tvp-teal-100)", color: "var(--tvp-teal)" }}>
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <strong>Private by default.</strong>{" "}
              <span className="tvp-muted">
                These preset folders belong to the Talent. The Talent can add private folders/subfolders later, and Agency users cannot see anything here unless the Talent deliberately shares or copies it.
              </span>
            </div>
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <div>
                <h2 className="tvp-h2">Private Vault Folder Structure</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Preset folders and subfolders for personal document organisation.</p>
              </div>
              <button className="tvp-secondary"><Plus className="h-4 w-4" /> Add Private Folder</button>
            </div>
            <FolderTree folders={privateFolders} />
          </div>

          <div className="tvp-card" style={{ marginTop: 22 }}>
            <div className="tvp-toolbar">
              <input className="tvp-search" placeholder="Search private documents..." />
              <div className="tvp-row-actions">
                <select className="tvp-select"><option>Folder: All</option><option>Personal</option><option>Dependents</option><option>Health</option><option>Insurance</option><option>Tax</option><option>Pets</option></select>
                <select className="tvp-select"><option>Status: All</option><option>Filed</option><option>AI Review</option><option>Expiring Soon</option></select>
              </div>
            </div>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead><tr><th>Document</th><th>Folder</th><th>Subfolder</th><th>Visibility</th><th>Reminder</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {privateDocs.map((d) => (
                    <tr key={d.name}>
                      <td>
                        <strong>{d.name}</strong>
                        {d.uploaded && <div className="tvp-muted" style={{ fontSize: 11, marginTop: 2 }}>{d.uploaded}</div>}
                      </td>
                      <td>{d.folder}</td>
                      <td>{d.sub}</td>
                      <td><span className="tvp-status tvp-teal">Private</span></td>
                      <td>{d.reminder}</td>
                      <td><span className={`tvp-status tvp-${d.statusTone}`}>{d.status}</span></td>
                      <td>
                        <div className="tvp-row-actions">
                          {d.status === "Review AI" && (
                            <button className="tvp-mini-btn" onClick={() => setMode("review")}><Sparkles className="h-4 w-4" /></button>
                          )}
                          <button className="tvp-mini-btn"><Share2 className="h-4 w-4" /></button>
                          <button className="tvp-mini-btn"><ArrowLeftRight className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

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


