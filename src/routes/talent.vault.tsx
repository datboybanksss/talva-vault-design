import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus, Upload, Lock, FileStack, Sparkles, User, Baby, HeartPulse, Shield, PawPrint, Landmark,
  Briefcase, IdCard, Plane, Star, MoreVertical, Share2, ArrowLeftRight, Info,
} from "lucide-react";

export const Route = createFileRoute("/talent/vault")({
  head: () => ({ meta: [{ title: "Vault · TalVault Talent" }] }),
  component: VaultPage,
});

type Mode = "private" | "agency" | "review";

const privateFolders = [
  { Icon: User, tone: "teal", name: "Personal", subs: ["ID", "Passport", "Visa", "Driver's License", "Birth Certificate"] },
  { Icon: Baby, tone: "blue", name: "Dependents", subs: ["Birth Certificate", "Vaccine Cards", "School Records", "Bursary Records"] },
  { Icon: HeartPulse, tone: "green", name: "Health", subs: ["Medical Aid Certificate", "Doctor's Referral", "Organ Donor Proof"] },
  { Icon: Shield, tone: "purple", name: "Insurance", subs: ["Home Insurance", "Car Insurance", "Life Insurance", "Critical Illness & Disability", "Claim Documents"] },
  {
    Icon: Landmark, tone: "amber", name: "Tax",
    subs: [
      "Provisional Tax (IRP6)",
      "Income Tax Return (ITR12)",
      "Tax Clearance Certificate",
      "Sponsorship & Endorsement Income",
      "Prize Money & Appearance Fees",
      "Royalties & Image Rights",
      "Agent / Manager Commission Invoices",
      "Expense Receipts",
      "Travel Logbook",
      "Training & Equipment Expenses",
      "Foreign Income & DTA Records",
      "SARS Correspondence",
    ],
  },
  { Icon: PawPrint, tone: "red", name: "Pets", subs: ["Pet Insurance", "Vaccine Record"] },
];

const agencyFolders = [
  { Icon: Briefcase, tone: "blue", name: "Contracts", subs: ["Representation Agreements", "Brand Deals", "Renewals"] },
  { Icon: IdCard, tone: "teal", name: "ID Documents", subs: ["ID", "Passport", "Certified Copies"] },
  { Icon: Plane, tone: "amber", name: "Travel", subs: ["Passport", "Visa", "Travel Letters"] },
  { Icon: Star, tone: "purple", name: "Sponsorships", subs: ["Campaign Documents", "Usage Rights", "Approvals"] },
];

const privateDocs = [
  { name: "Passport.pdf", uploaded: "Uploaded 2h ago", folder: "Personal", sub: "Passport", reminder: "AI suggested", status: "Review AI", statusTone: "purple" },
  { name: "Medical Aid Certificate.pdf", folder: "Health", sub: "Medical Aid Certificate", reminder: "No reminder", status: "Filed", statusTone: "green" },
  { name: "Life Insurance Policy.pdf", folder: "Insurance", sub: "Life Insurance", reminder: "Annual review", status: "Filed", statusTone: "green" },
  { name: "Pet Vaccine Record.pdf", folder: "Pets", sub: "Vaccine Record", reminder: "12 months", status: "Filed", statusTone: "green" },
];

const agencyDocs = [
  { name: "Passport.pdf", folder: "Travel", sub: "Passport", by: "Talent", ai: "Needs confirmation", aiTone: "purple", reminder: "AI suggested" },
  { name: "Agency Contract.pdf", folder: "Contracts", sub: "Representation Agreements", by: "Agency", ai: "Confirmed", aiTone: "green", reminder: "30 days before review" },
  { name: "Sponsorship Agreement.pdf", folder: "Sponsorships", sub: "Campaign Documents", by: "Talent", ai: "Confirmed", aiTone: "green", reminder: "1 year" },
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

      {mode === "agency" && (
        <>
          <div className="tvp-callout">
            <div className="tvp-callout-icon"><FileStack className="h-4 w-4" /></div>
            <div>
              <strong>Agency-controlled folder structure.</strong>{" "}
              <span className="tvp-muted">
                The Agency sets the folders and subfolders in the Agency–Talent Shared Folder. Talent can view and upload to the allowed folders, but cannot edit, rename, delete, reorder, or create Agency-defined folders/subfolders.
              </span>
            </div>
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <div>
                <h2 className="tvp-h2">Agency–Talent Shared Folder Structure</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Defined by Mbeki Sports Management. Read-only folder structure for Talent.</p>
              </div>
              <span className="tvp-lock-note"><Lock className="h-3 w-3" /> Folder structure locked by Agency</span>
            </div>
            <FolderTree folders={agencyFolders} />
          </div>

          <div className="tvp-card" style={{ marginTop: 22 }}>
            <div className="tvp-toolbar">
              <input className="tvp-search" placeholder="Search Agency Shared Folder..." />
              <div className="tvp-row-actions">
                <select className="tvp-select"><option>Folder: All</option><option>Contracts</option><option>ID Documents</option><option>Travel</option><option>Sponsorships</option></select>
                <select className="tvp-select"><option>Shared By: All</option><option>Talent</option><option>Agency</option></select>
              </div>
            </div>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead><tr><th>Document</th><th>Folder</th><th>Subfolder</th><th>Shared By</th><th>AI Status</th><th>Reminder</th><th></th></tr></thead>
                <tbody>
                  {agencyDocs.map((d) => (
                    <tr key={d.name}>
                      <td><strong>{d.name}</strong></td>
                      <td>{d.folder}</td>
                      <td>{d.sub}</td>
                      <td>{d.by}</td>
                      <td><span className={`tvp-status tvp-${d.aiTone}`}>{d.ai}</span></td>
                      <td>{d.reminder}</td>
                      <td>
                        {d.ai === "Needs confirmation" ? (
                          <button className="tvp-mini-btn" onClick={() => setMode("review")}><Sparkles className="h-4 w-4" /></button>
                        ) : (
                          <button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

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

function FolderTree({
  folders,
}: {
  folders: { Icon: React.ComponentType<{ className?: string }>; tone: string; name: string; subs: string[] }[];
}) {
  return (
    <div className="tvp-folder-tree">
      {folders.map((f) => (
        <div key={f.name} className="tvp-folder-card">
          <h3>
            <span className={`tvp-kpi-icon tvp-bg-${f.tone}`} style={{ width: 36, height: 36 }}>
              <f.Icon className="h-4 w-4" />
            </span>
            {f.name}
          </h3>
          <div className="tvp-subfolder-list">
            {f.subs.map((s) => <span key={s} className="tvp-subfolder-pill">{s}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}
