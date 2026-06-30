import { createFileRoute } from "@tanstack/react-router";
import { Share2, Key, Ban } from "lucide-react";

export const Route = createFileRoute("/talent/sharing")({
  head: () => ({ meta: [{ title: "Shared Access · TalVault Talent" }] }),
  component: SharingPage,
});

const rows = [
  { name: "Saurabh Prasad", email: "saurabh@example.com", item: "Family folder", perm: "View + Download", permTone: "blue", duration: "30 days · expires in 3 days", status: "Expiring", statusTone: "amber" },
  { name: "Nomsa M.", email: "nomsa@example.com", item: "Passport.pdf", perm: "View only", permTone: "teal", duration: "7 days", status: "Active", statusTone: "green" },
];

function SharingPage() {
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Shared Access</h1>
          <div className="tvp-subtitle">
            Manage documents or folders shared with Loved Ones and trusted contacts.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary"><Share2 className="h-4 w-4" /> Share Document / Folder</button>
        </div>
      </div>

      <div className="tvp-callout" style={{ background: "#ECFDF5", borderColor: "#B7EAD3" }}>
        <div className="tvp-callout-icon" style={{ background: "var(--tvp-green-bg)", color: "var(--tvp-green)" }}>
          <Key className="h-4 w-4" />
        </div>
        <div>
          <strong>Separate access password.</strong>{" "}
          <span className="tvp-muted">Recipients receive an email link. You share the password/code separately.</span>
        </div>
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search shared access..." />
          <select className="tvp-select">
            <option>Status: All</option><option>Active</option><option>Expiring Soon</option><option>Expired</option><option>Revoked</option>
          </select>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead><tr><th>Recipient</th><th>Shared Item</th><th>Permission</th><th>Access Duration</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="tvp-muted" style={{ fontSize: 11, marginTop: 2 }}>{r.email}</div>
                  </td>
                  <td>{r.item}</td>
                  <td><span className={`tvp-status tvp-${r.permTone}`}>{r.perm}</span></td>
                  <td>{r.duration}</td>
                  <td><span className={`tvp-status tvp-${r.statusTone}`}>{r.status}</span></td>
                  <td>
                    <div className="tvp-row-actions">
                      <button className="tvp-mini-btn" aria-label="Copy code"><Key className="h-4 w-4" /></button>
                      <button className="tvp-mini-btn" aria-label="Revoke"><Ban className="h-4 w-4" /></button>
                    </div>
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
