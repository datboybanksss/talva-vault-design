import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Filter, Plus, MoreVertical, Building2, CheckCircle2, Send, Clock, Ban, X, Lock } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin/agencies")({
  head: () => ({ meta: [{ title: "Agencies · TalVault Admin" }] }),
  component: AgenciesPage,
});

const agencies = [
  { id: "mbeki-sports", name: "Mbeki Sports Management", reg: "Reg. 2026/045678/07", status: "Accepted", tone: "green", owner: "Thandi Ndlovu", joined: "12 May 2026", talent: 24, next: "View agency" },
  { id: "starburst", name: "StarBurst Talent Agency", reg: "Reg. 2026/036789/08", status: "Invited", tone: "blue", owner: "Lara Prasad", joined: "28 May 2026", talent: 18, next: "Await agency response" },
  { id: "elite", name: "Elite Performers SA", reg: "Reg. 2026/051234/08", status: "Incomplete", tone: "purple", owner: "Israel Noko", joined: "25 May 2026", talent: 15, next: "Complete and send invite" },
  { id: "nextgen", name: "Next Gen Artists", reg: "Reg. 2026/061789/07", status: "Incomplete", tone: "purple", owner: "Aviwe Okafor", joined: "3 Jun 2026", talent: 8, next: "Complete onboarding details" },
  { id: "summit", name: "Summit Entertainment", reg: "Reg. 2026/047111/07", status: "Suspended", tone: "amber", owner: "Thandi Ndlovu", joined: "20 Apr 2026", talent: 12, next: "Review suspension" },
  { id: "creative-hub", name: "Creative Artists Hub", reg: "Reg. 2026/088890/07", status: "Accepted", tone: "green", owner: "Israel Noko", joined: "18 Apr 2026", talent: 22, next: "View agency" },
];

const tabs = [
  { key: "all", label: "All", icon: Building2, count: 47, tone: "neutral" },
  { key: "Accepted", label: "Accepted", icon: CheckCircle2, count: 28, tone: "green" },
  { key: "Invited", label: "Invited", icon: Send, count: 5, tone: "blue" },
  { key: "Incomplete", label: "Incomplete", icon: Clock, count: 8, tone: "purple" },
  { key: "Suspended", label: "Suspended", icon: Ban, count: 2, tone: "amber" },
  { key: "Declined", label: "Declined", icon: X, count: 1, tone: "red" },
  { key: "Cancelled", label: "Cancelled", icon: X, count: 1, tone: "neutral" },
];

function AgenciesPage() {
  const [tab, setTab] = useState("all");
  const visible = tab === "all" ? agencies : agencies.filter((a) => a.status === tab);

  const exportCsv = () => {
    const headers = ["Agency", "Registration", "Status", "Owner", "Joined", "Talent", "Next Action"];
    const rows = visible.map((a) => [a.name, a.reg, a.status, a.owner, a.joined, String(a.talent), a.next]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agencies-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agencies</h1>
          <div className="tvp-subtitle">Manage and monitor all agency accounts.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>
          <button className="tvp-secondary"><Filter className="h-4 w-4" />Filters</button>

          <Link to="/admin/invitations/new" className="tvp-primary">
            <Plus className="h-4 w-4" />Add Agency
          </Link>
        </div>
      </div>

      <div className="tvp-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className={`tvp-status tvp-${t.tone}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search agencies..." />
          <div className="tvp-row-actions" style={{ flexWrap: "wrap" }}>
            <select className="tvp-select"><option>Status: All</option></select>
            <select className="tvp-select"><option>Owner: All</option></select>
            <select className="tvp-select"><option>Agency Type: All</option></select>
            <select className="tvp-select"><option>Sort by: Newest</option></select>
          </div>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr><th>Agency</th><th>Status</th><th>Owner</th><th>Joined</th><th>Talent</th><th>Next Action</th><th></th></tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to="/admin/agencies/$id" params={{ id: a.id }}>
                      <strong>{a.name}</strong>
                    </Link>
                    <br /><span className="tvp-muted">{a.reg}</span>
                  </td>
                  <td>
                    <span className={`tvp-status tvp-${a.tone}`}>{a.status}</span>
                    {a.status === "Suspended" && (
                      <span
                        className="tvp-muted"
                        title="Suspended: active actions blocked, read-only + export preserved"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, fontSize: 11 }}
                      >
                        <Lock className="h-3 w-3" /> read-only
                      </span>
                    )}
                  </td>
                  <td>{a.owner}</td>
                  <td>{a.joined}</td>
                  <td>{a.talent}</td>
                  <td>{a.next}</td>
                  <td>
                    <button
                      className="tvp-mini-btn"
                      disabled={a.status === "Suspended"}
                      title={a.status === "Suspended"
                        ? "Active actions blocked while suspended. Use Export for read-only access."
                        : "Row actions"}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
