import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Callout,
  MetricCard,
  PageHeader,
  PortalShell,
  StatusPill,
  type NavItem,
  type Notification,
} from "@/components/portal-shell";
import {
  CheckCircle2,
  Download,
  FileText,
  Folder,
  Heart,
  LayoutDashboard,
  Lock,
  Plus,
  Settings,
  Sparkles,
  Upload,
  Vault,
  Wallet,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/talent")({
  head: () => ({
    meta: [
      { title: "Talent · TalVault" },
      {
        name: "description",
        content:
          "Your private vault, agency shared folder and AI review — all in one trusted place.",
      },
    ],
  }),
  component: TalentPortal,
});

const nav: NavItem[] = [
  { to: "/talent", label: "Home", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/talent/vault", label: "Vault", icon: <Vault className="h-4 w-4" /> },
  { to: "/talent/budget", label: "Budget & Income", icon: <Wallet className="h-4 w-4" /> },
  { to: "/talent/loved-ones", label: "Loved Ones", icon: <Heart className="h-4 w-4" /> },
  { to: "/talent/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

const notifications: Notification[] = [
  {
    id: "1",
    title: "AI suggestion for a new upload",
    detail: "Passport_Scan.pdf · confirm folder and expiry",
    tone: "purple",
    time: "Just now",
  },
  {
    id: "2",
    title: "Document expires in 21 days",
    detail: "O-1 Visa — renew or update",
    tone: "amber",
    time: "Today",
  },
  {
    id: "3",
    title: "Loved One access expiring",
    detail: "Mum's read access to Medical folder ends in 4 days",
    tone: "blue",
    time: "Yesterday",
  },
];

const privateDocs = [
  { name: "Passport.pdf", folder: "Identity", expires: "12 Aug 2031", status: "ok" as const },
  { name: "O-1 Visa.pdf", folder: "Identity", expires: "21 Jul 2026", status: "expiring" as const },
  { name: "Medical_Insurance.pdf", folder: "Health", expires: "30 Apr 2027", status: "ok" as const },
];

const sharedDocs = [
  { name: "Headshot_2026.jpg", folder: "Marketing", updated: "by Bright Lights · 2d ago" },
  { name: "Showreel_v3.mp4", folder: "Showreels", updated: "by Bright Lights · 1w ago" },
];

const aiPending = [
  {
    file: "Passport_Scan.pdf",
    folder: "Identity",
    sub: "Government IDs",
    expiry: "12 Aug 2031",
    reminder: "60 days before",
  },
];

const tabs = [
  { id: "private", label: "Private Vault", icon: Lock },
  { id: "shared", label: "Agency Shared", icon: Folder },
  { id: "ai", label: "AI Review", icon: Sparkles },
] as const;

function TalentPortal() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("private");

  return (
    <PortalShell
      brand="TalVault"
      roleLabel="Talent"
      nav={nav}
      notifications={notifications}
      user={{ name: "Maya Chen", meta: "Actor · Bright Lights", initials: "MC" }}
    >
      <PageHeader
        eyebrow="Your vault"
        title="Welcome back, Maya"
        subtitle="Your Private Vault stays with you. Your agency only sees what's in the Shared Folder."
        actions={
          <>
            <button className="tv-btn-secondary">
              <Plus className="h-4 w-4" />
              New folder
            </button>
            <button className="tv-btn-primary">
              <Upload className="h-4 w-4" />
              Upload document
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-7">
        <MetricCard tone="teal" icon={<Lock className="h-5 w-5" />} label="Private documents" value="42" helper="Only visible to you" />
        <MetricCard tone="blue" icon={<Folder className="h-5 w-5" />} label="Shared with agency" value="18" helper="Read-only structure" />
        <MetricCard tone="purple" icon={<Sparkles className="h-5 w-5" />} label="AI suggestions" value="1" helper="Awaiting your confirmation" />
      </div>

      <div className="tv-card p-1.5 inline-flex gap-1 mb-5 flex-wrap">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="tv-focus-ring inline-flex items-center gap-2 px-4 h-10 rounded-xl text-[13px] font-black transition-colors"
              style={{
                background: active ? "var(--teal-100)" : "transparent",
                color: active ? "var(--teal)" : "var(--text-body)",
              }}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "private" && (
        <div className="space-y-5">
          <Callout
            tone="teal"
            icon={<Lock className="h-5 w-5" />}
            title="This is your Private Vault"
          >
            Only you can see what's stored here. Not your agency, not the admin
            team, not your loved ones — unless you explicitly share an item.
          </Callout>

          <div className="tv-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead
                  className="text-[11px] uppercase tracking-wider text-muted-fg"
                  style={{ background: "var(--surface-soft)" }}
                >
                  <tr>
                    <th className="px-5 py-3 font-black">Document</th>
                    <th className="px-5 py-3 font-black">Folder</th>
                    <th className="px-5 py-3 font-black">Expires</th>
                    <th className="px-5 py-3 font-black"></th>
                  </tr>
                </thead>
                <tbody>
                  {privateDocs.map((d) => (
                    <tr key={d.name} className="border-t border-line">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="grid place-items-center h-9 w-9 rounded-xl shrink-0"
                            style={{ background: "var(--teal-100)", color: "var(--teal)" }}
                          >
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[14px] font-black text-ink truncate">
                              {d.name}
                            </div>
                            <div className="text-[11px] text-muted-fg flex items-center gap-1 mt-0.5">
                              <Lock className="h-3 w-3" /> Private
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-text-body">{d.folder}</td>
                      <td className="px-5 py-4">
                        {d.status === "expiring" ? (
                          <StatusPill tone="amber" label={`${d.expires} · soon`} />
                        ) : (
                          <span className="text-[13px] text-text-body">{d.expires}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="tv-icon-btn" aria-label="Download">
                          <Download className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "shared" && (
        <div className="space-y-5">
          <Callout
            tone="blue"
            icon={<Folder className="h-5 w-5" />}
            title="Agency Shared Folder"
          >
            Folder structure is set by Bright Lights Talent and can't be
            edited here. Authorised people at your agency can see these
            items.
          </Callout>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sharedDocs.map((d) => (
              <div key={d.name} className="tv-card p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="grid place-items-center h-11 w-11 rounded-xl shrink-0"
                    style={{ background: "var(--blue-bg)", color: "var(--blue)" }}
                  >
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black text-ink truncate">
                      {d.name}
                    </div>
                    <div className="text-[12px] text-muted-fg mt-0.5">
                      {d.folder} · {d.updated}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <StatusPill tone="blue" label="Shared with agency" />
                      <StatusPill tone="teal" label="Read-only" icon={<Lock className="h-3 w-3" />} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="space-y-5">
          <Callout
            tone="purple"
            icon={<Sparkles className="h-5 w-5" />}
            title="AI suggestions need your confirmation"
          >
            Nothing is filed and no reminders are set until you confirm.
            You can edit any field before approving.
          </Callout>

          {aiPending.map((s) => (
            <div
              key={s.file}
              className="tv-card p-6"
              style={{ borderColor: "#D6CAF7" }}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <div className="text-[16px] font-black text-ink truncate">
                    {s.file}
                  </div>
                  <div className="text-[12px] text-muted-fg mt-0.5">
                    Uploaded just now · scanning complete
                  </div>
                </div>
                <StatusPill tone="purple" label="AI Review" icon={<Sparkles className="h-3 w-3" />} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <Field label="Folder" value={s.folder} />
                <Field label="Subfolder" value={s.sub} />
                <Field label="Expiry date" value={s.expiry} />
                <Field label="Reminder" value={s.reminder} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="tv-btn-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm & file
                </button>
                <button className="tv-btn-secondary">Edit details</button>
                <button className="tv-btn-secondary" style={{ color: "var(--red)" }}>
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--surface-soft)", border: "1px solid var(--line)" }}
    >
      <div className="text-[11px] font-black uppercase tracking-wider text-muted-fg mb-1">
        {label}
      </div>
      <div className="text-[14px] font-black text-ink">{value}</div>
    </div>
  );
}
