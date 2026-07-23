import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateTalentProfile } from "@/lib/talent.functions";

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
  const rootMatch = useRouterState({
    select: (s) => s.matches.find((m) => m.routeId === "/talent"),
  });
  const ctx = (rootMatch?.loaderData ?? null) as
    | {
        profile: { full_name: string; email: string | null } | null;
        agency: { name: string } | null;
        link: { talent_type: string | null; status: string } | null;
      }
    | null;

  const [fullName, setFullName] = useState(ctx?.profile?.full_name ?? "");
  const [talentType, setTalentType] = useState(ctx?.link?.talent_type ?? "Athlete");
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (ctx?.profile?.full_name) setFullName(ctx.profile.full_name);
    if (ctx?.link?.talent_type) setTalentType(ctx.link.talent_type);
  }, [ctx?.profile?.full_name, ctx?.link?.talent_type]);

  async function saveProfile() {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setSavingProfile(true);
    try {
      await updateTalentProfile({ data: { full_name: fullName.trim(), talent_type: talentType || null } });
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function updatePassword() {
    if (newPassword.length < 12) {
      toast.error("Password must be at least 12 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function sendResetEmail() {
    const email = ctx?.profile?.email;
    if (!email) {
      toast.error("No email on file");
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success(`Reset link sent to ${email}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send reset email");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Settings</h1>
          <div className="tvp-subtitle">Manage profile, account, relationship and notifications.</div>
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
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Talent Profile</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Your display name and talent type as shown to your agency.</p>
            </div>
            <button className="tvp-primary" onClick={saveProfile} disabled={savingProfile}>
              <Save className="h-4 w-4" /> {savingProfile ? "Saving…" : "Save Profile"}
            </button>
          </div>
          <div className="tvp-form-grid" style={{ marginTop: 12 }}>
            <div className="tvp-form-group">
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="tvp-form-group">
              <label>Email</label>
              <input value={ctx?.profile?.email ?? ""} disabled />
            </div>
            <div className="tvp-form-group">
              <label>Talent Type</label>
              <select value={talentType} onChange={(e) => setTalentType(e.target.value)}>
                <option>Athlete</option>
                <option>Artist</option>
                <option>Model</option>
                <option>Other</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === "account" && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Account</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Change your password or request a reset email.</p>
            </div>
          </div>

          <div className="tvp-sub-card">
            <h3 className="tvp-h3">Change Password</h3>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Use a strong password to protect your Private Vault and shared access.
            </p>
            <div className="tvp-form-grid">
              <div className="tvp-form-group">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
              </div>
              <div className="tvp-form-group">
                <label>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
              </div>
            </div>
            <div className="tvp-callout">
              <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
              <div>
                <strong>Password rule</strong><br />
                <span className="tvp-muted">Minimum 12 characters. Use a mix of uppercase, lowercase, numbers and symbols.</span>
              </div>
            </div>
            <div className="tvp-footer-actions">
              <button className="tvp-secondary" onClick={sendResetEmail} disabled={sendingReset}>
                {sendingReset ? "Sending…" : "Send Password Reset Email"}
              </button>
              <button className="tvp-primary" onClick={updatePassword} disabled={savingPassword}>
                {savingPassword ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "relationship" && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Agency Relationship</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
            Linked Agency:{" "}
            <strong style={{ color: "var(--tvp-ink)" }}>{ctx?.agency?.name ?? "—"}</strong>
            {ctx?.link?.status ? <> · <span className="tvp-muted">{ctx.link.status}</span></> : null}
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
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Notification preferences will be wired when the reminder engine ships.
          </p>
          <div className="tvp-doc-grid" style={{ marginTop: 14 }}>
            {notifications.map((n) => (
              <label key={n} className="tvp-doc-card" style={{ cursor: "pointer", opacity: 0.7 }}>
                <input type="checkbox" defaultChecked disabled style={{ width: 18, height: 18 }} />
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
