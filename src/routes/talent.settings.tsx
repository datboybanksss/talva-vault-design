import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info, Save } from "lucide-react";
import { toast } from "sonner";
import { updateTalentProfile, getTalentNotificationPrefs, updateTalentNotificationPrefs } from "@/lib/talent.functions";
import { VaultFoldersPanel } from "@/components/talent/vault-folders-panel";
import { PasswordCard } from "@/components/account/password-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";

export const Route = createFileRoute("/talent/settings")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({ meta: [{ title: "Settings · TalVault Talent" }] }),
  component: TalentSettings,
});

type Mode = "profile" | "account" | "folders" | "relationship" | "notifications";

const notifications = [
  "Agency shares a document",
  "Shared document expiring",
  "Loved One access expiring",
  "AI suggestions need review",
];

function TalentSettings() {
  const { tab } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(
    (["profile", "account", "folders", "relationship", "notifications"] as const).includes(tab as Mode)
      ? (tab as Mode)
      : "profile",
  );
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
  const [expiryDays, setExpiryDays] = useState("30");
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    getTalentNotificationPrefs().then((r: any) => setExpiryDays(String(r?.expiryNoticeDays ?? 30))).catch(() => {});
  }, []);

  async function saveNotificationPrefs() {
    const n = Number(expiryDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      toast.error("Enter a whole number of days between 1 and 365");
      return;
    }
    setSavingPrefs(true);
    try {
      await updateTalentNotificationPrefs({ data: { expiry_notice_days: n } });
      toast.success(`You'll be warned ${n} days before a document expires`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save notification settings");
    } finally {
      setSavingPrefs(false);
    }
  }

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
        <button className={`tvp-tab${mode === "folders" ? " tvp-active" : ""}`} onClick={() => setMode("folders")}>Manage folders</button>

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
        <div className="tvp-account-grid">
          <PasswordCard
            email={ctx?.profile?.email ?? ""}
            logPasswordChange={async () => {}}
          />
          <TwoFactorCard
            email={ctx?.profile?.email ?? ""}
            logEnrolled={async () => {}}
            logDisabled={async () => {}}
            contextLabel="talent"
          />
        </div>
      )}

      {mode === "folders" && <VaultFoldersPanel />}

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
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Notifications</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                Choose how early you want to be warned about expiring documents.
              </p>
            </div>
            <button className="tvp-primary" onClick={saveNotificationPrefs} disabled={savingPrefs}>
              <Save className="h-4 w-4" /> {savingPrefs ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="tvp-form-grid" style={{ marginTop: 12 }}>
            <div className="tvp-form-group">
              <label>Warn me before a document expires</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  style={{ maxWidth: 120 }}
                />
                <span className="tvp-muted" style={{ fontSize: 13, fontWeight: 700 }}>days ahead</span>
              </div>
              <p className="tvp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Drives the “Expiring soon” tile on your dashboard.
              </p>
            </div>
          </div>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 18, fontWeight: 800 }}>
            Email reminders
          </p>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 2 }}>
            These channels will be wired when the reminder engine ships.
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
