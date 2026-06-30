import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Plus, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/agency/talent")({
  head: () => ({ meta: [{ title: "Talent · TalVault Agency" }] }),
  component: TalentPage,
});

const tabs = [
  { label: "All", count: 24, tone: "neutral" },
  { label: "Active", count: 18, tone: "green" },
  { label: "Invited", count: 6, tone: "blue" },
  { label: "Expired", count: 2, tone: "amber" },
  { label: "Read-only", count: 3, tone: "teal" },
  { label: "Revoked", count: 1, tone: "red" },
];

const rows = [
  { name: "Caster Semenya", sub: "Athlete · Connected 12 May 2026", status: "Active", statusTone: "green", manager: "Thandi Ndlovu", folder: "Enabled", folderTone: "green", docs: 32, next: "Review new uploads" },
  { name: "Lara Maseko", sub: "Model · Invited 3 Jun 2026", status: "Invited", statusTone: "blue", manager: "Sipho Dlamini", folder: "Not active", folderTone: "neutral", docs: 0, next: "Await acceptance" },
  { name: "Neo Khumalo", sub: "Artist · Connected 22 May 2026", status: "Needs Review", statusTone: "purple", manager: "Aaliyah Mokoena", folder: "Enabled", folderTone: "green", docs: 18, next: "Confirm AI filing" },
  { name: "Maya Daniels", sub: "Artist · Relationship ended", status: "Read-only", statusTone: "teal", manager: "Thandi Ndlovu", folder: "View/export only", folderTone: "teal", docs: 24, next: "No new actions" },
];

function TalentPage() {
  const [tab, setTab] = useState("All");
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Talent</h1>
          <div className="tvp-subtitle">Manage Talent workspaces, invitations and shared professional folders.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Download className="h-4 w-4" />Export</button>
          <Link to="/agency/talent/invite" className="tvp-primary"><Plus className="h-4 w-4" />Invite Talent</Link>
        </div>
      </div>

      <div className="tvp-tabs">
        {tabs.map((t) => (
          <button key={t.label} className={`tvp-tab${tab === t.label ? " tvp-active" : ""}`} onClick={() => setTab(t.label)}>
            {t.label} <span className={`tvp-status tvp-${t.tone}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search talent..." />
          <div className="flex gap-2">
            <select className="tvp-select"><option>Status: All</option><option>Active</option><option>Invited</option><option>Expired</option></select>
            <select className="tvp-select"><option>Manager: All</option><option>Thandi Ndlovu</option><option>Sipho Dlamini</option></select>
            <select className="tvp-select"><option>Talent Type: All</option><option>Athlete</option><option>Artist</option><option>Model</option></select>
          </div>
        </div>
        <table className="tvp-table">
          <thead><tr><th>Talent</th><th>Status</th><th>Manager</th><th>Shared Folder</th><th>Documents</th><th>Next Action</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td><strong>{r.name}</strong><br /><span className="tvp-muted">{r.sub}</span></td>
                <td><span className={`tvp-status tvp-${r.statusTone}`}>{r.status}</span></td>
                <td>{r.manager}</td>
                <td><span className={`tvp-status tvp-${r.folderTone}`}>{r.folder}</span></td>
                <td>{r.docs}</td>
                <td>{r.next}</td>
                <td><button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
