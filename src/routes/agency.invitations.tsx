import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Link2, RotateCcw, Ban, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/agency/invitations")({
  head: () => ({ meta: [{ title: "Invitations · TalVault Agency" }] }),
  component: InvitationsPage,
});

const tabs = [
  { label: "All", count: 14, tone: "neutral" },
  { label: "Talent", count: 8, tone: "blue" },
  { label: "Staff", count: 6, tone: "teal" },
  { label: "Expired", count: 2, tone: "amber" },
  { label: "Revoked", count: 1, tone: "red" },
];

const rows = [
  { name: "Lara Maseko", email: "lara@example.com", type: "Talent Invite", typeTone: "blue", status: "Invited", statusTone: "blue", sentBy: "Thandi Ndlovu", expires: "3 days", showActions: true },
  { name: "Sipho Dlamini", email: "sipho@agency.co.za", type: "Staff Invite", typeTone: "teal", status: "Accepted", statusTone: "green", sentBy: "Thandi Ndlovu", expires: "—", showActions: false },
  { name: "Tumelo Nkosi", email: "tumelo@example.com", type: "Talent Invite", typeTone: "blue", status: "Expired", statusTone: "amber", sentBy: "Sipho Dlamini", expires: "Expired", showActions: true },
];

function InvitationsPage() {
  const [tab, setTab] = useState("All");
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Invitations</h1>
          <div className="tvp-subtitle">Manage Agency staff and Talent invitations.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary">Invite Staff</button>
          <Link to="/agency/talent/invite" className="tvp-primary">Invite Talent</Link>
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
          <input className="tvp-search" placeholder="Search invitations..." />
          <div className="flex gap-2">
            <select className="tvp-select"><option>Type: All</option><option>Talent</option><option>Staff</option></select>
            <select className="tvp-select"><option>Status: All</option><option>Invited</option><option>Accepted</option><option>Expired</option></select>
          </div>
        </div>
        <table className="tvp-table">
          <thead><tr><th>Recipient</th><th>Email</th><th>Type</th><th>Status</th><th>Sent By</th><th>Expires In</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email}>
                <td><strong>{r.name}</strong></td>
                <td>{r.email}</td>
                <td><span className={`tvp-status tvp-${r.typeTone}`}>{r.type}</span></td>
                <td><span className={`tvp-status tvp-${r.statusTone}`}>{r.status}</span></td>
                <td>{r.sentBy}</td>
                <td>{r.expires}</td>
                <td>
                  {r.showActions ? (
                    <div className="flex gap-1">
                      <button className="tvp-mini-btn"><Link2 className="h-4 w-4" /></button>
                      <button className="tvp-mini-btn"><RotateCcw className="h-4 w-4" /></button>
                      <button className="tvp-mini-btn"><Ban className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
