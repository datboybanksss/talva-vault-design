import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Send, Info, Link2, RefreshCw, Ban, Pencil } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin/invitations")({
  head: () => ({ meta: [{ title: "Agency Invitations · TalVault Admin" }] }),
  component: InvitationsPage,
});

const invites = [
  { agency: "NewTech Solutions", code: "AG-1028", contact: "Maya Johnson", email: "maya.j@newtechsol.com", sentBy: "Thandi M.", sentDate: "20 May 2026", expires: { label: "3 days", tone: "amber" }, status: "Invited", tone: "blue" },
  { agency: "Indigo Group", code: "AG-0974", contact: "Liam Carter", email: "liam.c@indigogroup.com", sentBy: "Israel N.", sentDate: "18 May 2026", expires: { label: "1 day", tone: "amber" }, status: "Invited", tone: "blue" },
  { agency: "Pinnacle Advisors", code: "AG-0931", contact: "Sarah Williams", email: "sarah.w@pinnacleadvisors.com", sentBy: "Thandi M.", sentDate: "15 May 2026", expires: { label: "—", tone: "neutral" }, status: "Accepted", tone: "green" },
  { agency: "Dawn Labs", code: "AG-0887", contact: "James Lee", email: "james.lee@dawnlabs.com", sentBy: "Israel N.", sentDate: "12 May 2026", expires: { label: "Expired", tone: "red" }, status: "Expired", tone: "red" },
  { agency: "Silverline Partners", code: "AG-0643", contact: "Emma Davis", email: "emma@silverline.com", sentBy: "Thandi M.", sentDate: "8 May 2026", expires: { label: "—", tone: "neutral" }, status: "Declined", tone: "neutral" },
];

const tabs = [
  { key: "all", label: "All", count: 24, tone: "neutral" },
  { key: "Invited", label: "Invited", count: 14, tone: "amber" },
  { key: "Accepted", label: "Accepted", count: 5, tone: "green" },
  { key: "Declined", label: "Declined", count: 1, tone: "red" },
  { key: "Expired", label: "Expired", count: 2, tone: "red" },
];

function InvitationsPage() {
  const [tab, setTab] = useState("all");
  const visible = tab === "all" ? invites : invites.filter((i) => i.status === tab);

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agency Invitations</h1>
          <div className="tvp-subtitle">Track and manage agency invitations sent by TalVault Admin.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Download className="h-4 w-4" />Export</button>
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Send className="h-4 w-4" />Send Invitation
          </Link>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div><strong>This screen shows only invitations sent by TalVault Admin to agency contacts.</strong></div>
      </div>

      <div className="tvp-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className={`tvp-status tvp-${t.tone}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search invitations..." />
          <div className="tvp-row-actions" style={{ flexWrap: "wrap" }}>
            <select className="tvp-select"><option>Status: All</option></select>
            <select className="tvp-select"><option>Sent By: All</option></select>
            <select className="tvp-select"><option>Agency Type: All</option></select>
          </div>
        </div>
        <table className="tvp-table">
          <thead>
            <tr><th>Agency</th><th>Main Contact</th><th>Sent By</th><th>Sent Date</th><th>Expires In</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.code}>
                <td><strong>{i.agency}</strong><br /><span className="tvp-muted">{i.code}</span></td>
                <td>{i.contact}<br /><span className="tvp-muted">{i.email}</span></td>
                <td>{i.sentBy}</td>
                <td>{i.sentDate}</td>
                <td><span className={`tvp-status tvp-${i.expires.tone}`}>{i.expires.label}</span></td>
                <td><span className={`tvp-status tvp-${i.tone}`}>{i.status}</span></td>
                <td className="tvp-row-actions">
                  <button className="tvp-mini-btn" title="Edit email"><Pencil className="h-3.5 w-3.5" /></button>
                  <button className="tvp-mini-btn" title="Resend"><RefreshCw className="h-3.5 w-3.5" /></button>
                  <button className="tvp-mini-btn" title="Copy link"><Link2 className="h-3.5 w-3.5" /></button>
                  <button className="tvp-mini-btn" title="Revoke"><Ban className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
