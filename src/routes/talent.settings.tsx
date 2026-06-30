import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Info, Save } from "lucide-react";

export const Route = createFileRoute("/talent/settings")({
  head: () => ({ meta: [{ title: "Settings · TalVault Talent" }] }),
  component: TalentSettings,
});

type Mode = "profile" | "account" | "relationship" | "notifications";

const notifications = [
  "Agency shares a document",
  "Shared document expiring",
  "Loved One access expiring",
  "AI suggestions need review",
];

function TalentSettings() {
  const [mode, setMode] = useState<Mode>("profile");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Settings</h1>
          <div className="tvp-subtitle">Manage profile, account, relationship and notifications.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary"><Save className="h-4 w-4" /> Save Settings</button>
        </div>
      </div>

      <div className="tvp-tabs">
        <button className={`tvp-tab${mode === "profile" ? " tvp-active" : ""}`} onClick={() => setMode("profile")}>Profile</button>
        <button className={`tvp-tab${mode === "account" ? " tvp-active" : ""}`} onClick={() => setMode("account")}>Account</button>
        <button className={`tvp-tab${mode === "relationship" ? " tvp-active" : ""}`} onClick={() => setMode("relationship")}>Agency Relationship</button>
        <button className={`tvp-tab${mode === "notifications" ? " tvp-active" : ""}`} onClick={() => setMode("notifications")}>Notifications</button>
      </div>

      {mode === "profile" && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Talent Profile</h2>
          <div className="tvp-form-grid" style={{ marginTop: 12 }}>
            <div className="tvp-form-group"><label>First Name</label><input defaultValue="Caster" /></div>
            <div className="tvp-form-group"><label>Surname</label><input defaultValue="Semenya" /></div>
            <div className="tvp-form-group"><label>Email</label><input defaultValue="caster@example.com" /></div>
            <div className="tvp-form-group">
              <label>Talent Type</label>
              <select><option>Athlete</option><option>Artist</option><option>Model</option></select>
            </div>
          </div>
        </div>
      )}

      {mode === "account" && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Account</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Update your email address or change your password.</p>
            </div>
            <button className="tvp-primary">Save Account Changes</button>
          </div>

          <div className="tvp-sub-card">
            <h3 className="tvp-h3">Email Address</h3>
            <div className="tvp-form-grid">
              <div className="tvp-form-group"><label>Current Email</label><input defaultValue="caster@example.com" /></div>
              <div className="tvp-form-group"><label>New Email</label><input placeholder="Enter new email address" /></div>
            </div>
          </div>

          <div className="tvp-sub-card">
            <h3 className="tvp-h3">Change Password</h3>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Use a strong password to protect your Private Vault, Agency Shared Folder access and Loved One sharing controls.
            </p>
            <div className="tvp-form-grid">
              <div className="tvp-form-group"><label>Current Password</label><input type="password" placeholder="Enter current password" /></div>
              <div className="tvp-form-group"><label>New Password</label><input type="password" placeholder="Enter new password" /></div>
              <div className="tvp-form-group"><label>Confirm New Password</label><input type="password" placeholder="Confirm new password" /></div>
            </div>
            <div className="tvp-callout">
              <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
              <div>
                <strong>Password rule</strong><br />
                <span className="tvp-muted">Minimum 12 characters, including uppercase, lowercase, number and symbol.</span>
              </div>
            </div>
            <div className="tvp-footer-actions">
              <button className="tvp-secondary">Send Password Reset Email</button>
              <button className="tvp-primary">Update Password</button>
            </div>
          </div>
        </div>
      )}

      {mode === "relationship" && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Agency Relationship</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
            Linked Agency: <strong style={{ color: "var(--tvp-ink)" }}>Mbeki Sports Management</strong>.
          </p>
          <div className="tvp-callout">
            <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
            <div>
              If the relationship ends, the shared folder moves to read-only/export access. Private Vault remains yours.
            </div>
          </div>
        </div>
      )}

      {mode === "notifications" && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Notifications</h2>
          <div className="tvp-doc-grid" style={{ marginTop: 14 }}>
            {notifications.map((n) => (
              <label key={n} className="tvp-doc-card" style={{ cursor: "pointer" }}>
                <input type="checkbox" defaultChecked style={{ width: 18, height: 18 }} />
                <div><strong>{n}</strong></div>
                <span />
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
