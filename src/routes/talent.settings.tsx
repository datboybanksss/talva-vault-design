import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info, Save } from "lucide-react";
import { toast } from "sonner";
import { updateTalentProfile, getTalentNotificationPrefs, updateTalentNotificationPrefs } from "@/lib/talent.functions";
import { VaultFoldersPanel } from "@/components/talent/vault-folders-panel";
import { PasswordCard } from "@/components/account/password-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";
import { SecurityLogPanel } from "@/components/talent/security-log-panel";
import {
  logTalentPasswordChange,
  logTalentMfaEnrolled,
  logTalentMfaDisabled,
} from "@/lib/talent-audit.functions";

export const Route = createFileRoute("/talent/settings")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  head: () => ({ meta: [{ title: "Settings · TalVault Talent" }] }),
  component: TalentSettings,
});

type Mode = "profile" | "account" | "security" | "folders" | "relationship" | "notifications";

const IN_APP_CHANNELS: { key: string; label: string; hint: string; live: boolean }[] = [
  { key: "doc_expiring", label: "Document expiring", hint: "Private Vault and Agency Shared Folder documents approaching their expiry date.", live: true },
  { key: "share_expiring", label: "Loved One access expiring", hint: "A magic-link share you created is about to lapse.", live: true },
  { key: "agency_share", label: "Agency shares a document", hint: "Arrives with the shared-folder event stream.", live: false },
  { key: "ai_review", label: "AI suggestions need review", hint: "Arrives when AI filing runs server-side.", live: false },
];

function TalentSettings() {
  const { tab } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(
    (["profile", "account", "security", "folders", "relationship", "notifications"] as const).includes(tab as Mode)
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
  const [inApp, setInApp] = useState<Record<string, boolean>>({
    doc_expiring: true, share_expiring: true, agency_share: true, ai_review: true,
  });

  useEffect(() => {
    getTalentNotificationPrefs()
      .then((r: any) => {
        setExpiryDays(String(r?.expiryNoticeDays ?? 30));
        if (r?.inApp) setInApp((p) => ({ ...p, ...r.inApp }));
      })
      .catch(() => {});
  }, []);

  async function saveNotificationPrefs() {
    const n = Number(expiryDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      toast.error("Enter a whole number of days between 1 and 365");
      return;
    }
    setSavingPrefs(true);
    try {
      await updateTalentNotificationPrefs({ data: { expiry_notice_days: n, in_app: inApp } });
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
        <button className={`tvp-tab${mode === "security" ? " tvp-active" : ""}`} onClick={() => setMode("security")}>Security log</button>
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
            logPasswordChange={() => logTalentPasswordChange()}
          />
          <TwoFactorCard
            email={ctx?.profile?.email ?? ""}
            logEnrolled={(payload) => logTalentMfaEnrolled({ data: payload })}
            logDisabled={() => logTalentMfaDisabled()}
            contextLabel="talent"
          />
        </div>
      )}

      {mode === "security" && <SecurityLogPanel />}

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
            In-app reminders
          </p>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 2 }}>
            These drive the “Needs attention” panel on your dashboard. Email delivery is switched off
            until the TalVault sending domain is verified.
          </p>
          <div className="tvp-doc-grid" style={{ marginTop: 12 }}>
            {IN_APP_CHANNELS.map((c) => (
              <label
                key={c.key}
                className="tvp-doc-card"
                style={{ cursor: c.live ? "pointer" : "not-allowed", opacity: c.live ? 1 : 0.6 }}
              >
                <input
                  type="checkbox"
                  checked={c.live ? inApp[c.key] !== false : false}
                  disabled={!c.live}
                  onChange={(e) => setInApp((p) => ({ ...p, [c.key]: e.target.checked }))}
                  style={{ width: 18, height: 18 }}
                />
                <div>
                  <strong>{c.label}</strong>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>{c.hint}</div>
                </div>
                <span className={`tvp-status tvp-${c.live ? "green" : "neutral"}`}>
                  {c.live ? "Active" : "Soon"}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
