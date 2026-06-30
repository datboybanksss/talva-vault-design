import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Users, CheckCircle2, Clock, XCircle, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/admin/administrators")({
  head: () => ({ meta: [{ title: "Administrators · TalVault Admin" }] }),
  component: AdminsPage,
});

const admins = [
  { name: "Israel Noko", you: true, email: "israel@npiconsulting.co.za", role: "Main Administrator", roleTone: "purple", status: "Accepted", statusTone: "green", last: "Just now" },
  { name: "Lara Prasad", email: "laranel@outlook.com", role: "Main Administrator", roleTone: "purple", status: "Accepted", statusTone: "green", last: "1h ago" },
  { name: "Thandi M.", email: "thandi@talvault.com", role: "Administrator", roleTone: "blue", status: "Accepted", statusTone: "green", last: "2h ago" },
  { name: "Ndiphi T.", email: "ndiphi@talvault.com", role: "Administrator", roleTone: "blue", status: "Invited", statusTone: "blue", last: "—" },
];

function AdminsPage() {
  const [tab, setTab] = useState<"admins" | "account">("admins");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Administrators</h1>
          <div className="tvp-subtitle">Manage platform administrators, invitations and access.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary"><Plus className="h-4 w-4" />Invite Administrator</button>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div><div><div className="tvp-kpi-value">24</div><div className="tvp-kpi-label">Total Administrators</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div><div><div className="tvp-kpi-value">18</div><div className="tvp-kpi-label">Active Administrators</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-amber"><Clock className="h-5 w-5" /></div><div><div className="tvp-kpi-value">6</div><div className="tvp-kpi-label">Pending Invitations</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-red"><XCircle className="h-5 w-5" /></div><div><div className="tvp-kpi-value">2</div><div className="tvp-kpi-label">Deactivated</div></div></div>
      </div>

      <div className="tvp-tabs">
        <button className={`tvp-tab${tab === "admins" ? " tvp-active" : ""}`} onClick={() => setTab("admins")}>Administrators</button>
        <button className={`tvp-tab${tab === "account" ? " tvp-active" : ""}`} onClick={() => setTab("account")}>My Account</button>
      </div>

      {tab === "admins" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Administrators</h2>
            <input className="tvp-search" placeholder="Search administrators..." />
          </div>
          <table className="tvp-table">
            <thead><tr><th>Administrator</th><th>Email</th><th>Role</th><th>Status</th><th>Last Active</th><th></th></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.email}>
                  <td>
                    <strong>{a.name}</strong>
                    {a.you && <span className="tvp-status tvp-blue" style={{ marginLeft: 8, padding: "3px 7px", fontSize: 10 }}>You</span>}
                  </td>
                  <td>{a.email}</td>
                  <td><span className={`tvp-status tvp-${a.roleTone}`}>{a.role}</span></td>
                  <td><span className={`tvp-status tvp-${a.statusTone}`}>{a.status}</span></td>
                  <td>{a.last}</td>
                  <td><button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "account" && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">My Account</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Update the email address and password you use to access TalVault Admin.</p>
            </div>
            <button className="tvp-secondary">View access history</button>
          </div>
          <div className="tvp-form-layout">
            <div>
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Update email address</h3>
                <div className="tvp-form-group"><label>Current email address</label><input defaultValue="israel@npiconsulting.co.za" /></div>
                <div className="tvp-form-group"><label>New email address</label><input placeholder="Enter new email address" /></div>
                <div className="tvp-form-group"><label>Confirm new email address</label><input placeholder="Confirm new email address" /></div>
                <div className="tvp-footer-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="tvp-primary">Save email address</button>
                </div>
              </div>
              <div className="tvp-sub-card">
                <h3 className="tvp-h3">Change password</h3>
                <div className="tvp-form-group"><label>Current password</label><input type="password" defaultValue="TalVault101!!" /></div>
                <div className="tvp-form-group"><label>New password</label><input type="password" placeholder="Enter new password" /></div>
                <div className="tvp-form-group"><label>Confirm new password</label><input type="password" placeholder="Confirm new password" /></div>
                <div className="tvp-footer-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="tvp-primary">Update password</button>
                </div>
              </div>
            </div>
            <div>
              <div className="tvp-card tvp-panel">
                <h3 className="tvp-h3">Account guidance</h3>
                <div className="tvp-checklist-row">✓ Use an email address you can access.</div>
                <div className="tvp-checklist-row">✓ Password changes are logged.</div>
                <div className="tvp-checklist-row">✓ Use a strong password with upper, lower, number and symbol.</div>
                <div className="tvp-checklist-row">✓ If your email changes, future login must use the new email.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
