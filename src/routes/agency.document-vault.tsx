import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, FolderOpen, Sparkles, FileText, MoreVertical, Info } from "lucide-react";

export const Route = createFileRoute("/agency/document-vault")({
  head: () => ({ meta: [{ title: "Document Vault · TalVault Agency" }] }),
  component: VaultPage,
});

const tabs = ["All Documents", "Needs Review", "Expiring", "Recently Updated"];

const docs = [
  { name: "Caster_Semenya_Contract_2025.pdf", talent: "Caster Semenya", folder: "Contracts", status: "AI suggested", statusTone: "purple", validity: "Expires 12 Mar 2027" },
  { name: "Lara_Maseko_ID_Copy.pdf", talent: "Lara Maseko", folder: "ID Documents", status: "Filed", statusTone: "green", validity: "No expiry" },
  { name: "Neo_Khumalo_Travel_Visa.pdf", talent: "Neo Khumalo", folder: "Travel", status: "Needs review", statusTone: "amber", validity: "Expires 22 Aug 2026" },
  { name: "Tax_Clearance_2025.pdf", talent: "Caster Semenya", folder: "Tax", status: "Filed", statusTone: "green", validity: "Expires 31 Dec 2026" },
];

function VaultPage() {
  const [tab, setTab] = useState(tabs[0]);
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Document Vault</h1>
          <div className="tvp-subtitle">Agency-visible documents across Talent Shared Folders.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><FolderOpen className="h-4 w-4" />Browse folders</button>
          <button className="tvp-primary"><Upload className="h-4 w-4" />Upload to Talent</button>
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
            <input className="tvp-search" placeholder="Search documents..." />
            <div className="flex gap-2">
              <select className="tvp-select"><option>Folder: All</option><option>Contracts</option><option>ID Documents</option><option>Travel</option><option>Tax</option></select>
              <select className="tvp-select"><option>Talent: All</option><option>Caster Semenya</option><option>Neo Khumalo</option></select>
            </div>
          </div>
          <table className="tvp-table">
            <thead><tr><th>Document</th><th>Talent</th><th>Folder</th><th>Status</th><th>Validity</th><th></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.name}>
                  <td><FileText className="inline h-4 w-4 mr-2 text-[var(--tvp-muted)]" /><strong>{d.name}</strong></td>
                  <td>{d.talent}</td>
                  <td>{d.folder}</td>
                  <td><span className={`tvp-status tvp-${d.statusTone}`}>{d.status}</span></td>
                  <td className="tvp-muted">{d.validity}</td>
                  <td><button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="tvp-stack">
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">AI Filing Suggestions</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Confirm before filing. Suggestions are never applied automatically.</p>
            <div className="tvp-ai-box">
              <strong><Sparkles className="inline h-4 w-4 mr-1" />Caster_Semenya_Contract_2025.pdf</strong>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>Suggested folder: <strong>Contracts</strong> · Expiry: 12 Mar 2027</div>
              <div className="flex gap-2 mt-3">
                <button className="tvp-primary" style={{ height: 36, padding: "0 12px" }}>Confirm</button>
                <button className="tvp-secondary" style={{ height: 36, padding: "0 12px" }}>Edit</button>
              </div>
            </div>
            <div className="tvp-ai-box">
              <strong><Sparkles className="inline h-4 w-4 mr-1" />Neo_Khumalo_Travel_Visa.pdf</strong>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>Suggested folder: <strong>Travel</strong> · Expiry: 22 Aug 2026</div>
              <div className="flex gap-2 mt-3">
                <button className="tvp-primary" style={{ height: 36, padding: "0 12px" }}>Confirm</button>
                <button className="tvp-secondary" style={{ height: 36, padding: "0 12px" }}>Edit</button>
              </div>
            </div>
          </div>

          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Expiring soon</h2>
            <div className="tvp-list">
              <div className="tvp-list-item"><FileText className="h-5 w-5 text-[var(--tvp-amber)]" /><div><strong>Neo Khumalo · Travel Visa</strong><div className="tvp-muted">Expires 22 Aug 2026</div></div><span className="tvp-status tvp-amber">53 days</span></div>
              <div className="tvp-list-item"><FileText className="h-5 w-5 text-[var(--tvp-amber)]" /><div><strong>Caster Semenya · Tax Clearance</strong><div className="tvp-muted">Expires 31 Dec 2026</div></div><span className="tvp-status tvp-blue">184 days</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
