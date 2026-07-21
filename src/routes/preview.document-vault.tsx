import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, FolderOpen, FileText, Eye, Download, History, Lock } from "lucide-react";

export const Route = createFileRoute("/preview/document-vault")({
  head: () => ({ meta: [{ title: "Document Vault Preview · TalVault Agency" }] }),
  component: Preview,
});

const tabs = ["All Documents", "Needs Review", "Expiring", "Recently Updated"] as const;
type Tab = typeof tabs[number];

function Preview() {
  const [tab, setTab] = useState<Tab>("All Documents");
  return (
    <div className="tv-app">
      <aside className="tvp-sidebar" style={{ width: 280 }}>
        <div className="tvp-brand">
          <div className="tvp-brand-mark">TV</div>
          <div className="tvp-brand-copy">
            <div className="tvp-brand-title">TalVault</div>
            <div className="tvp-brand-sub">AGENCY</div>
          </div>
        </div>
      </aside>
      <main className="tvp-main">
        <div className="tvp-topbar" style={{ marginBottom: 12 }}>
          <div>
            <h1 className="tvp-h1">Document Vault</h1>
            <div className="tvp-subtitle">Agency-visible documents across Talent Shared Folders.</div>
          </div>
          <div className="tvp-actions">
            <button className="tvp-secondary"><FolderOpen className="h-4 w-4" />Browse folders</button>
            <button className="tvp-primary"><Upload className="h-4 w-4" />Upload to Talent</button>
          </div>
        </div>

        <div className="tvp-card" style={{ marginBottom: 10, padding: "10px 14px" }}>
          <h2 className="tvp-h2" style={{ marginBottom: 4 }}>Expiring soon</h2>
          <p className="tvp-muted" style={{ fontSize: 13, margin: 0 }}>
            Nothing expiring in the next 180 days.
          </p>
        </div>

        <div className="tvp-tabs" style={{ marginTop: 10, marginBottom: 14 }}>
          {tabs.map((t) => (
            <button key={t} className={`tvp-tab${tab === t ? " tvp-active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="tvp-two-col">
          <div className="tvp-card">
            <div className="tvp-toolbar">
              <input className="tvp-search" placeholder="Search documents..." />
              <div className="tvp-row-actions">
                <select className="tvp-select"><option>Folder: All</option></select>
                <select className="tvp-select"><option>Talent: All</option></select>
              </div>
            </div>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr><th>Document</th><th>Talent</th><th>Folder</th><th>Status</th><th>Validity</th><th></th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <FileText className="h-4 w-4" style={{ color: "var(--tvp-muted)" }} />
                        <strong>Sample Contract.pdf</strong>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--tvp-amber)", fontSize: 12 }}>
                          <Lock className="h-3.5 w-3.5" />
                          Locked · 14 Jul 2036
                        </span>
                      </div>
                    </td>
                    <td>Sample Talent</td>
                    <td>Contracts</td>
                    <td><span className="tvp-status tvp-green">Filed</span></td>
                    <td className="tvp-muted">Expires 14 Jul 2036</td>
                    <td>
                      <div className="tvp-row-actions">
                        <button className="tvp-mini-btn"><Eye className="h-4 w-4" /></button>
                        <button className="tvp-mini-btn"><Download className="h-4 w-4" /></button>
                        <button className="tvp-mini-btn"><History className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">AI Filing Suggestions</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>No suggestions pending.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

