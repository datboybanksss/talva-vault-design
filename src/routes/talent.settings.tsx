import { useId } from "react";
import { SHARE_RECIPIENT_TERM_CAPITALISED } from "@/lib/terms";
import { PageBand } from "@/components/shared/brand";
import { Switch } from "@/components/ui/switch";
import { statusLabel, statusPillClass } from "@/lib/status-labels";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info, Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import {
  updateTalentProfile,
  getTalentNotificationPrefs,
  updateTalentNotificationPrefs,
} from "@/lib/talent.functions";
import { useTalentAgencyLinks } from "@/lib/talent-agency-links";
import { AgencyRelationshipsPanel } from "@/components/talent/agency-relationships-panel";
import { VaultFoldersPanel } from "@/components/talent/vault-folders-panel";
import { PasswordCard } from "@/components/account/password-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";
import { AiFilingPreferenceCard } from "@/components/account/ai-filing-preference-card";
import { MyTermsAcceptances } from "@/components/shared/my-terms-acceptances";
import { SecurityLogPanel } from "@/components/talent/security-log-panel";
import { logTalentPasswordChange } from "@/lib/talent-audit.functions";
import { useFolderCatalogue, talentTypesFrom } from "@/lib/folder-catalogue";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/talent/settings")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  head: () => ({ meta: [{ title: "Settings · TalVault Talent" }] }),
  component: TalentSettings,
});

type Mode = "profile" | "account" | "security" | "folders" | "relationship" | "notifications";

const IN_APP_CHANNELS: { key: string; label: string; hint: string }[] = [
  {
    key: "doc_expiring",
    label: "Document expiring",
    hint: "When a document in your vault is close to its expiry date.",
  },
  {
    key: "share_expiring",
    label: `${SHARE_RECIPIENT_TERM_CAPITALISED} access expiring`,
    hint: "When a secure link you shared is about to stop working.",
  },
];

function TalentSettings() {
  const a11yId = useId();
  const { tab } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(
    (
      ["profile", "account", "security", "folders", "relationship", "notifications"] as const
    ).includes(tab as Mode)
      ? (tab as Mode)
      : "profile",
  );
  // Keep the selected tab visible when the tab row scrolls on small screens.
  useEffect(() => {
    document
      .querySelector(".tvp-settings-tabs .tvp-active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [mode]);
  const rootMatch = useRouterState({
    select: (s) => s.matches.find((m) => m.routeId === "/talent"),
  });
  const ctx = (rootMatch?.loaderData ?? null) as {
    profile: { full_name: string; email: string | null } | null;
    agency: { name: string } | null;
    link: { talent_type: string | null; status: string } | null;
    hasActiveLink?: boolean;
  } | null;
  // Current or past agency relationship (ended links with shared items).
  const agencyLinks = useTalentAgencyLinks();
  // Shown for current/past relationships, and kept visible if the read failed
  // (the panel then explains the error) — never hidden as "independent".
  const hasRelationship = agencyLinks.isError || (agencyLinks.data?.relationships.length ?? 0) > 0;
  // A link to the Agency relationship tab with no relationship falls back to Profile.
  useEffect(() => {
    if (mode === "relationship" && agencyLinks.isSuccess && !hasRelationship) setMode("profile");
  }, [mode, agencyLinks.isSuccess, hasRelationship]);

  const [fullName, setFullName] = useState(ctx?.profile?.full_name ?? "");
  const [talentType, setTalentType] = useState(ctx?.link?.talent_type ?? "");
  const catalogue = useFolderCatalogue();
  const talentTypeOptions = talentTypesFrom(catalogue);
  const [savingProfile, setSavingProfile] = useState(false);
  const [expiryDays, setExpiryDays] = useState("30");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [inApp, setInApp] = useState<Record<string, boolean>>({
    doc_expiring: true,
    share_expiring: true,
    agency_share: true,
    ai_review: true,
  });

  useEffect(() => {
    getTalentNotificationPrefs()
      .then((r) => {
        setExpiryDays(String(r?.expiryNoticeDays ?? 30));
        setInAppEnabled(r?.inAppEnabled !== false);
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
      await updateTalentNotificationPrefs({
        data: { expiry_notice_days: n, in_app_enabled: inAppEnabled, in_app: inApp },
      });
      toast.success(`You'll be warned ${n} days before a document expires`);
    } catch (e: unknown) {
      toast.error(friendlyError(e, "Could not save notification settings"));
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
      await updateTalentProfile({
        data: { full_name: fullName.trim(), talent_type: talentType || null },
      });
      toast.success("Profile updated");
    } catch (e: unknown) {
      toast.error(friendlyError(e, "Failed to update profile"));
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <>
      <PageBand
        icon={<SettingsIcon />}
        title="Settings"
        subtitle={
          hasRelationship
            ? "Manage your profile, account, agency relationship and notifications."
            : "Manage your profile, account and notifications."
        }
      />

      <div
        className="tvp-tabs tvp-roster-tabs tvp-settings-tabs"
        role="tablist"
        data-tour="talent-settings-tabs"
      >
        <button
          className={`tvp-tab${mode === "profile" ? " tvp-active" : ""}`}
          onClick={() => setMode("profile")}
        >
          Profile
        </button>
        <button
          className={`tvp-tab${mode === "account" ? " tvp-active" : ""}`}
          onClick={() => setMode("account")}
        >
          Account
        </button>
        <button
          className={`tvp-tab${mode === "security" ? " tvp-active" : ""}`}
          onClick={() => setMode("security")}
        >
          Security log
        </button>
        <button
          className={`tvp-tab${mode === "folders" ? " tvp-active" : ""}`}
          onClick={() => setMode("folders")}
        >
          Manage folders
        </button>

        {hasRelationship && (
          <button
            className={`tvp-tab${mode === "relationship" ? " tvp-active" : ""}`}
            onClick={() => setMode("relationship")}
          >
            Agency relationship
          </button>
        )}
        <button
          className={`tvp-tab${mode === "notifications" ? " tvp-active" : ""}`}
          onClick={() => setMode("notifications")}
        >
          Notifications
        </button>
      </div>

      {mode === "profile" && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div>
              <h2 className="tvp-h2">Talent Profile</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {hasRelationship
                  ? "Your display name and talent type as shown to your agency."
                  : "Your display name and talent type."}
              </p>
            </div>
            <button className="tvp-primary" onClick={saveProfile} disabled={savingProfile}>
              <Save className="h-4 w-4" /> {savingProfile ? "Saving…" : "Save Profile"}
            </button>
          </div>
          <div className="tvp-form-grid" style={{ marginTop: 12 }}>
            <div className="tvp-form-group">
              <label htmlFor={`${a11yId}-field-0`}>Full Name</label>
              <input id={`${a11yId}-field-0`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="tvp-form-group">
              <label htmlFor={`${a11yId}-field-1`}>Email</label>
              <input id={`${a11yId}-field-1`} value={ctx?.profile?.email ?? ""} disabled />
            </div>
            <div className="tvp-form-group">
              <label htmlFor={`${a11yId}-field-2`}>Talent Type</label>
              <select id={`${a11yId}-field-2`} value={talentType} onChange={(e) => setTalentType(e.target.value)}>
                <option value="">Not set</option>
                {talentTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {talentType && !talentTypeOptions.includes(talentType) && (
                  <option value={talentType}>{talentType}</option>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === "account" && (
        <div className="tvp-account-grid">
          <div className="tvp-account-full">
            <AiFilingPreferenceCard />
          </div>
          <PasswordCard
            email={ctx?.profile?.email ?? ""}
            logPasswordChange={() => logTalentPasswordChange()}
          />
          <TwoFactorCard contextLabel="talent" />
          <div className="tvp-account-full">
            <MyTermsAcceptances portal="talent" />
          </div>
        </div>
      )}

      {mode === "security" && <SecurityLogPanel />}

      {mode === "folders" && <VaultFoldersPanel />}

      {mode === "relationship" && hasRelationship && <AgencyRelationshipsPanel />}

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
                <span className="tvp-muted" style={{ fontSize: 13, fontWeight: 700 }}>
                  days ahead
                </span>
              </div>
              <p className="tvp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Drives the “Expiring soon” tile on your dashboard.
              </p>
            </div>
          </div>
          <h3 className="tv-pref-heading">In-app notifications</h3>
          <div className="tv-pref-list">
            <div className="tv-pref-row">
              <div className="tv-pref-text">
                <label htmlFor="pref-in-app" className="tv-pref-label">
                  Show reminders in TalVault
                </label>
                <p className="tv-pref-hint">
                  Reminders appear in the notification bell. Switch this off and you won't get any
                  reminders.
                </p>
              </div>
              <Switch id="pref-in-app" checked={inAppEnabled} onCheckedChange={setInAppEnabled} />
            </div>
          </div>

          <h3 className="tv-pref-heading">Choose which reminders you want</h3>
          <div className="tv-pref-list">
            {IN_APP_CHANNELS.map((c) => (
              <div key={c.key} className="tv-pref-row">
                <div className="tv-pref-text">
                  <label htmlFor={`pref-${c.key}`} className="tv-pref-label">
                    {c.label}
                  </label>
                  <p className="tv-pref-hint">{c.hint}</p>
                </div>
                <Switch
                  id={`pref-${c.key}`}
                  checked={inApp[c.key] !== false}
                  disabled={!inAppEnabled}
                  onCheckedChange={(v) => setInApp((p) => ({ ...p, [c.key]: v }))}
                />
              </div>
            ))}
          </div>

          <h3 className="tv-pref-heading">Email notifications</h3>
          <div className="tv-pref-list">
            <div className="tv-pref-row tv-pref-off">
              <div className="tv-pref-text">
                <label htmlFor="pref-email" className="tv-pref-label">
                  Email me the same reminders
                </label>
                <p className="tv-pref-hint">
                  Email reminders are coming once our email service is switched on.
                </p>
              </div>
              <Switch id="pref-email" checked={false} disabled />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
