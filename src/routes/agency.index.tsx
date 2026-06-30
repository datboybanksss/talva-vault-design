import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Users, FileText, Mail, FileSpreadsheet, MoreVertical, Info } from "lucide-react";

export const Route = createFileRoute("/agency/")({
  head: () => ({ meta: [{ title: "Dashboard · TalVault Agency" }] }),
  component: AgencyDashboard,
});

const rows = [
  { name: "Caster Semenya", sub: "Connected 12 May 2026", status: "Active", statusTone: "green", type: "Athlete", manager: "Thandi Ndlovu", docs: 32, next: "Review new uploads" },
  { name: "Lara Maseko", sub: "Invited 3 Jun 2026", status: "Invited", statusTone: "blue", type: "Model", manager: "Sipho Dlamini", docs: 0, next: "Await acceptance" },
  { name: "Neo Khumalo", sub: "Connected 22 May 2026", status: "Needs Review", statusTone: "purple", type: "Artist", manager: "Aaliyah Mokoena", docs: 18, next: "Confirm AI filing" },
  { name: "Tumelo Nkosi", sub: "Invite expired 2 Jun 2026", status: "Expired", statusTone: "amber", type: "Athlete", manager: "Sipho Dlamini", docs: 0, next: "Reissue invite" },
  { name: "Maya Daniels", sub: "Relationship ended", status: "Read-only", statusTone: "teal", type: "Artist", manager: "Thandi Ndlovu", docs: 24, next: "Export/view only" },
];

const chips = [
  { label: "Active", num: 18, tone: "green", filter: "Active" },
  { label: "Invited", num: 6, tone: "blue", filter: "Invited" },
  { label: "Expired", num: 2, tone: "amber", filter: "Expired" },
  { label: "Read-only", num: 3, tone: "teal", filter: "Read-only" },
  { label: "Revoked", num: 1, tone: "red", filter: "Revoked" },
  { label: "Needs Review", num: 8, tone: "purple", filter: "Needs Review" },
];

function AgencyDashboard() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [manager, setManager] = useState("all");
  const [type, setType] = useState("all");

  const filtered = useMemo(() => rows.filter(r =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (manager === "all" || r.manager === manager) &&
    (type === "all" || r.type === type)
  ), [statusFilter, manager, type]);

  const reset = () => { setStatusFilter("all"); setManager("all"); setType("all"); };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agency Portal</h1>
          <div className="tvp-subtitle">Welcome back, Thandi. Here's what needs attention for Mbeki Sports Management.</div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <Link to="/agency/talent" className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div><div><div className="tvp-kpi-value">24</div><div className="tvp-kpi-label">Talent Profiles</div><div className="tvp-kpi-sub">+4 this month</div></div></Link>
        <Link to="/agency/document-vault" className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-blue"><FileText className="h-5 w-5" /></div><div><div className="tvp-kpi-value">96</div><div className="tvp-kpi-label">Vault Documents</div><div className="tvp-kpi-sub" style={{ color: "var(--tvp-blue)" }}>18 updated recently</div></div></Link>
        <Link to="/agency/invitations" className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-amber"><Mail className="h-5 w-5" /></div><div><div className="tvp-kpi-value">14</div><div className="tvp-kpi-label">Invitations</div><div className="tvp-kpi-sub tvp-warn">6 need action</div></div></Link>
        <Link to="/agency/quotes-invoices" className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-purple"><FileSpreadsheet className="h-5 w-5" /></div><div><div className="tvp-kpi-value">18</div><div className="tvp-kpi-label">Quotes & Invoices</div><div className="tvp-kpi-sub">4 need follow-up</div></div></Link>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Talent Workspace Overview <Info className="inline h-4 w-4 text-[var(--tvp-muted)]" /></h2>
          <Link to="/agency/talent" className="tvp-link">View all talent →</Link>
        </div>

        <div className="flex flex-wrap gap-3 pb-4">
          <select className="tvp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Status: All</option><option>Active</option><option>Invited</option><option>Expired</option><option>Read-only</option><option>Revoked</option><option>Needs Review</option>
          </select>
          <select className="tvp-select" value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="all">Manager: All</option><option>Thandi Ndlovu</option><option>Sipho Dlamini</option><option>Aaliyah Mokoena</option>
          </select>
          <select className="tvp-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Talent Type: All</option><option>Athlete</option><option>Artist</option><option>Model</option>
          </select>
          <button className="tvp-secondary" onClick={reset}>Reset filters</button>
        </div>

        <div className="tvp-life-chips">
          {chips.map((c) => (
            <button key={c.label} className={`tvp-life-chip${statusFilter === c.filter ? " tvp-active-filter" : ""}`} onClick={() => setStatusFilter(c.filter)} style={{ background: `var(--tvp-${c.tone}-bg)`, color: `var(--tvp-${c.tone})` }}>
              <div className="tvp-label">{c.label}</div>
              <div className="tvp-num">{c.num}</div>
            </button>
          ))}
        </div>

        <div className="tvp-muted" style={{ fontSize: 12, margin: "-4px 0 14px 2px" }}>
          {statusFilter === "all" && manager === "all" && type === "all" ? "Showing all talent workspaces" : `Showing ${filtered.length} of ${rows.length} workspaces`}
        </div>

        <table className="tvp-table">
          <thead><tr><th>Talent</th><th>Status</th><th>Type</th><th>Manager</th><th>Shared Docs</th><th>Next Action</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name}>
                <td><strong>{r.name}</strong><br /><span className="tvp-muted">{r.sub}</span></td>
                <td><span className={`tvp-status tvp-${r.statusTone}`}>{r.status}</span></td>
                <td>{r.type}</td>
                <td>{r.manager}</td>
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
