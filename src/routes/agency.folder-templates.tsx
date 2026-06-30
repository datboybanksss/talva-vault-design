import { createFileRoute } from "@tanstack/react-router";
import { Folder, Plus, Save, Info, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/agency/folder-templates")({
  head: () => ({ meta: [{ title: "Folder Templates · TalVault Agency" }] }),
  component: FolderTemplatesPage,
});

const folders = [
  { name: "ID Documents", note: "Recommended default", checked: true },
  { name: "Contracts", note: "Recommended default", checked: true },
  { name: "Travel", note: "Recommended default", checked: true },
  { name: "Certified Documents", note: "Recommended default", checked: true },
  { name: "Tax", note: "Recommended default", checked: true },
  { name: "Proof of Accounts", note: "Recommended default", checked: true },
  { name: "Property", note: "Optional default", checked: false },
  { name: "Other", note: "Optional default", checked: false },
  { name: "Sponsorships", note: "Custom default folder", checked: true, custom: true },
];

const rules = [
  { name: "ID Documents", applied: "Yes", appliedTone: "green", ai: "Yes", aiTone: "green", validity: "No expiry unless document indicates one", untick: "Yes" },
  { name: "Contracts", applied: "Yes", appliedTone: "green", ai: "Yes", aiTone: "green", validity: "3 years", untick: "Yes" },
  { name: "Travel", applied: "Yes", appliedTone: "green", ai: "Yes", aiTone: "green", validity: "Per document", untick: "Yes" },
  { name: "Tax", applied: "Yes", appliedTone: "green", ai: "Yes", aiTone: "green", validity: "End of tax year", untick: "Yes" },
  { name: "Property", applied: "No", appliedTone: "neutral", ai: "No", aiTone: "neutral", validity: "No expiry", untick: "Yes" },
];

function FolderTemplatesPage() {
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Folder Templates</h1>
          <div className="tvp-subtitle">Set default Agency Shared Folder templates applied at Talent onboarding.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Plus className="h-4 w-4" />Add Default Folder</button>
          <button className="tvp-primary"><Save className="h-4 w-4" />Save Template</button>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>How folder templates work.</strong> Default folders are offered at onboarding. Agency users may untick or add Talent-specific folders later.
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-teal"><Folder className="h-5 w-5" /></div><div><div className="tvp-kpi-value">8</div><div className="tvp-kpi-label">Default Folders</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-purple"><Plus className="h-5 w-5" /></div><div><div className="tvp-kpi-value">5</div><div className="tvp-kpi-label">Custom Talent Folders</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-green"><Folder className="h-5 w-5" /></div><div><div className="tvp-kpi-value">24</div><div className="tvp-kpi-label">Talent Using Template</div></div></div>
        <div className="tvp-card tvp-kpi"><div className="tvp-kpi-icon tvp-bg-blue"><Folder className="h-5 w-5" /></div><div><div className="tvp-kpi-value">12</div><div className="tvp-kpi-label">AI Filing Rules</div></div></div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Default Folder Selection</h2>
          <button className="tvp-link">Reset to recommended folders</button>
        </div>
        <p className="tvp-muted" style={{ fontSize: 13 }}>Tick the folders pre-selected for every new Talent profile.</p>
        <div className="tvp-rule-grid" style={{ marginTop: 16 }}>
          {folders.map((f) => (
            <label key={f.name} className="tvp-rule-card" style={f.custom ? { borderColor: "var(--tvp-teal-200)", background: "var(--tvp-teal-50)" } : undefined}>
              <span><input type="checkbox" defaultChecked={f.checked} />{f.name}</span>
              <span className="tvp-small">{f.note}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="tvp-card tvp-panel" style={{ marginTop: 18 }}>
        <h2 className="tvp-h2">Folder Rules</h2>
        <table className="tvp-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Folder</th><th>Applied by default?</th><th>AI filing allowed?</th><th>Default validity</th><th>Can untick?</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.name}>
                <td><strong>{r.name}</strong></td>
                <td><span className={`tvp-status tvp-${r.appliedTone}`}>{r.applied}</span></td>
                <td><span className={`tvp-status tvp-${r.aiTone}`}>{r.ai}</span></td>
                <td>{r.validity}</td>
                <td>{r.untick}</td>
                <td><button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
