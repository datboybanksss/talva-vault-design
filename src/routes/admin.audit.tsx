import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit & Support Log · TalVault Admin" }] }),
  component: AuditPage,
});

const events = [
  { id: "EVT-9F2B-7K81-LM44", time: "Today, 10:42", actor: "Thandi M.", role: "Administrator", action: "Suspended agency", area: "Agencies", areaTone: "teal", target: "BrightEdge Solutions", severity: "High", severityTone: "red" },
  { id: "EVT-9F2B-7K80-LM43", time: "Today, 09:15", actor: "Alicia P.", role: "Administrator", action: "Updated agency details", area: "Agencies", areaTone: "teal", target: "Summit Talent Group", severity: "Medium", severityTone: "amber" },
  { id: "EVT-9F2B-7K79-LM42", time: "Yesterday", actor: "Israel N.", role: "Administrator", action: "Created agency", area: "Agencies", areaTone: "teal", target: "FutureWave Agency", severity: "Low", severityTone: "green" },
  { id: "EVT-9F2B-7K78-LM41", time: "Yesterday", actor: "System", role: "System", action: "Invitation expired", area: "Invitations", areaTone: "blue", target: "Zenith Associates", severity: "Medium", severityTone: "amber" },
];

function AuditPage() {
  const [selected, setSelected] = useState(events[0]);

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Audit & Support Log</h1>
          <div className="tvp-subtitle">Track admin and support activities across the platform.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Download className="h-4 w-4" />Export Log</button>
        </div>
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search events, actors, targets..." />
          <div className="tvp-row-actions" style={{ flexWrap: "wrap" }}>
            <select className="tvp-select"><option>All Actors</option></select>
            <select className="tvp-select"><option>All Actions</option></select>
            <select className="tvp-select"><option>All Areas</option></select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 18, padding: 18 }}>
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Area</th><th>Target</th><th>Severity</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} onClick={() => setSelected(e)} style={{ cursor: "pointer" }}>
                    <td>{e.time}</td>
                    <td><strong>{e.actor}</strong><br /><span className="tvp-muted">{e.role}</span></td>
                    <td>{e.action}</td>
                    <td><span className={`tvp-status tvp-${e.areaTone}`}>{e.area}</span></td>
                    <td>{e.target}</td>
                    <td><span className={`tvp-status tvp-${e.severityTone}`}>{e.severity}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Event Details</h2>
            <p style={{ marginTop: 10 }}><span className={`tvp-status tvp-${selected.severityTone}`}>{selected.severity}</span></p>
            <h3 className="tvp-h3" style={{ marginTop: 10 }}>{selected.action}</h3>
            <p className="tvp-muted" style={{ fontSize: 12 }}>Event ID: {selected.id}</p>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Actor</div>
              <p><strong>{selected.actor}</strong><br /><span className="tvp-muted">{selected.role}</span></p>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Event Information</div>
              <p style={{ fontSize: 13 }}>Action: {selected.action}<br />Area: {selected.area}<br />Device: Chrome on Windows</p>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Target</div>
              <p><strong>{selected.target}</strong></p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
