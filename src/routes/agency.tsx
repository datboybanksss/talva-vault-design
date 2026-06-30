import { createFileRoute } from "@tanstack/react-router";
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
  Briefcase,
  Building2,
  CheckCircle2,
  FileText,
  Folder,
  LayoutDashboard,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  Upload,
  Users,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/agency")({
  head: () => ({
    meta: [
      { title: "Agency · TalVault" },
      {
        name: "description",
        content:
          "Operational workspace for talent agencies: talent, shared folders, quotes, invoices and AI review.",
      },
    ],
  }),
  component: AgencyPortal,
});

const nav: NavItem[] = [
  { to: "/agency", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/agency/talent", label: "Talent", icon: <Users className="h-4 w-4" />, badge: 28 },
  { to: "/agency/shared", label: "Shared Folder", icon: <Folder className="h-4 w-4" /> },
  { to: "/agency/clients", label: "Clients", icon: <Briefcase className="h-4 w-4" /> },
  { to: "/agency/finance", label: "Quotes & Invoices", icon: <Receipt className="h-4 w-4" /> },
  { to: "/agency/ai-review", label: "AI Review", icon: <Sparkles className="h-4 w-4" />, badge: 4 },
  { to: "/agency/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

const notifications: Notification[] = [
  {
    id: "1",
    title: "4 AI suggestions awaiting review",
    detail: "New contracts uploaded by Maya Chen and 2 others",
    tone: "purple",
    time: "10 min ago",
  },
  {
    id: "2",
    title: "Talent invite expired",
    detail: "Jordan Pierce never accepted — resend?",
    tone: "amber",
    time: "Today, 08:02",
  },
  {
    id: "3",
    title: "Invoice late",
    detail: "INV-1042 to Lumen Studios · 8 days overdue",
    tone: "red",
    time: "Today, 07:15",
  },
  {
    id: "4",
    title: "Visa document expiring",
    detail: "Maya Chen · O-1 expires in 21 days",
    tone: "amber",
    time: "Yesterday",
  },
];

const talent = [
  { name: "Maya Chen", role: "Actor", docs: 42, expiring: 2, status: "active" as const },
  { name: "Jordan Pierce", role: "Model", docs: 0, expiring: 0, status: "invited" as const },
  { name: "Theo Alvarez", role: "Voice artist", docs: 28, expiring: 0, status: "active" as const },
  { name: "Priya Raman", role: "Dancer", docs: 31, expiring: 1, status: "active" as const },
];

function AgencyPortal() {
  return (
    <PortalShell
      brand="TalVault"
      roleLabel="Talent Agency"
      nav={nav}
      notifications={notifications}
      user={{ name: "Bright Lights Talent", meta: "Agency workspace", initials: "BL" }}
    >
      <PageHeader
        eyebrow="Agency dashboard"
        title="Workspace overview"
        subtitle="Manage your talent roster, agency shared folder, finance and AI suggestions in one calm view."
        actions={
          <>
            <button className="tv-btn-secondary">
              <Upload className="h-4 w-4" />
              Upload
            </button>
            <button className="tv-btn-primary">
              <Plus className="h-4 w-4" />
              Invite talent
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        <MetricCard tone="teal" icon={<Users className="h-5 w-5" />} label="Active talent" value="28" helper="2 invites pending" />
        <MetricCard tone="blue" icon={<Folder className="h-5 w-5" />} label="Shared documents" value="1,240" helper="Across 38 folders" />
        <MetricCard tone="purple" icon={<Sparkles className="h-5 w-5" />} label="AI suggestions" value="4" helper="Awaiting confirmation" />
        <MetricCard tone="amber" icon={<Receipt className="h-5 w-5" />} label="Outstanding invoices" value="$18,420" helper="3 late" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-7">
        <div className="lg:col-span-2 tv-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div>
              <div className="text-[15px] font-black text-ink">Talent</div>
              <div className="text-[12px] text-muted-fg">
                Read-only summary · open a profile to manage shared folders
              </div>
            </div>
            <button className="tv-btn-ghost">View all →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead
                className="text-[11px] uppercase tracking-wider text-muted-fg"
                style={{ background: "var(--surface-soft)" }}
              >
                <tr>
                  <th className="px-5 py-3 font-black">Talent</th>
                  <th className="px-5 py-3 font-black">Role</th>
                  <th className="px-5 py-3 font-black text-right">Docs</th>
                  <th className="px-5 py-3 font-black">Status</th>
                </tr>
              </thead>
              <tbody>
                {talent.map((t) => (
                  <tr key={t.name} className="border-t border-line">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="grid place-items-center h-9 w-9 rounded-full font-black text-[12px]"
                          style={{ background: "var(--teal-100)", color: "var(--teal)" }}
                        >
                          {t.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div className="text-[14px] font-black text-ink">{t.name}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-text-body">{t.role}</td>
                    <td className="px-5 py-4 text-[13px] text-text-body text-right tabular-nums">
                      {t.docs > 0 ? t.docs : "—"}
                      {t.expiring > 0 && (
                        <span className="ml-2 tv-pill bg-tv-amber-bg text-tv-amber">
                          {t.expiring} expiring
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {t.status === "active" ? (
                        <StatusPill tone="green" label="Active" />
                      ) : (
                        <StatusPill tone="amber" label="Invite pending" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tv-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-tv-purple" />
            <div className="text-[15px] font-black text-ink">AI Review queue</div>
          </div>
          <p className="text-[12.5px] text-muted-fg mb-4">
            AI has suggested folder, subfolder and expiry. Confirm before
            anything is filed or reminders are set.
          </p>

          <div
            className="rounded-2xl p-4 mb-3"
            style={{
              background: "var(--purple-bg)",
              border: "1px solid #D6CAF7",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-black text-ink truncate">
                Maya_Chen_Contract_2026.pdf
              </div>
              <StatusPill tone="purple" label="AI" />
            </div>
            <div className="text-[12px] text-text-body space-y-1 mb-3">
              <div>
                Folder: <span className="font-black">Contracts</span>
              </div>
              <div>
                Subfolder: <span className="font-black">2026 / Film</span>
              </div>
              <div>
                Expires: <span className="font-black">14 Mar 2027</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-black"
                style={{ background: "var(--teal)", color: "#fff" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirm
              </button>
              <button className="h-9 px-3 rounded-lg text-[12px] font-black bg-white border border-line-strong text-ink">
                Edit
              </button>
              <button className="h-9 w-9 grid place-items-center rounded-lg bg-white border border-line-strong text-tv-red">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button className="tv-btn-ghost">See all 4 suggestions →</button>
        </div>
      </div>

      <Callout
        tone="blue"
        icon={<Building2 className="h-5 w-5" />}
        title="About the Agency Shared Folder"
      >
        Documents here are visible to authorised users at your agency.
        Talent see this as a read-only structure — your team controls how
        it's organised. Private Vault items always stay with the talent.
      </Callout>
    </PortalShell>
  );
}
