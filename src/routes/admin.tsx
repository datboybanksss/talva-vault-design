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
  Activity,
  AlertCircle,
  Building2,
  FileText,
  Gauge,
  LayoutDashboard,
  Mail,
  MoreHorizontal,
  Plus,
  Scale,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · TalVault" },
      {
        name: "description",
        content:
          "Operational overview of agencies, invites and platform health on TalVault.",
      },
    ],
  }),
  component: AdminPortal,
});

const nav: NavItem[] = [
  { to: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/admin/agencies", label: "Agencies", icon: <Building2 className="h-4 w-4" />, badge: 42 },
  { to: "/admin/invites", label: "Invites", icon: <Mail className="h-4 w-4" />, badge: 7 },
  { to: "/admin/reporting", label: "Reporting", icon: <Gauge className="h-4 w-4" /> },
  { to: "/admin/activity", label: "Activity log", icon: <Activity className="h-4 w-4" /> },
  { to: "/admin/legal", label: "Legal & copy", icon: <Scale className="h-4 w-4" /> },
  { to: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

const notifications: Notification[] = [
  {
    id: "1",
    title: "Agency invite expiring soon",
    detail: "Bright Lights Talent · expires in 2 days",
    tone: "amber",
    time: "Today, 09:14",
  },
  {
    id: "2",
    title: "Agency suspended",
    detail: "Northwind Artists flagged after 3 failed payment attempts",
    tone: "red",
    time: "Yesterday",
  },
  {
    id: "3",
    title: "Onboarding incomplete",
    detail: "Halo Creative — 4 of 9 onboarding steps remaining",
    tone: "blue",
    time: "Yesterday",
  },
  {
    id: "4",
    title: "Legal copy review reminder",
    detail: "Terms of Service v3.2 due for quarterly review",
    tone: "teal",
    time: "Mon",
  },
];

const agencies = [
  { name: "Bright Lights Talent", contact: "ops@brightlights.co", talent: 28, docs: 1240, status: "active" as const },
  { name: "Halo Creative", contact: "studio@halo.com", talent: 12, docs: 318, status: "onboarding" as const },
  { name: "Northwind Artists", contact: "admin@northwind.tv", talent: 0, docs: 0, status: "suspended" as const },
  { name: "Greenroom Agency", contact: "hello@greenroom.io", talent: 47, docs: 2106, status: "active" as const },
  { name: "Atlas Models", contact: "team@atlas.agency", talent: 19, docs: 642, status: "active" as const },
];

function AdminPortal() {
  return (
    <PortalShell
      brand="TalVault"
      roleLabel="Admin"
      nav={nav}
      notifications={notifications}
      user={{ name: "Iris Donovan", meta: "Platform admin", initials: "ID" }}
    >
      <PageHeader
        eyebrow="Platform overview"
        title="Good morning, Iris"
        subtitle="Aggregate operational view across agencies, talent and platform health. Private document contents stay with their owners."
        actions={
          <>
            <button className="tv-btn-secondary">Export CSV</button>
            <button className="tv-btn-primary">
              <Plus className="h-4 w-4" />
              Invite agency
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        <MetricCard
          tone="teal"
          icon={<Building2 className="h-5 w-5" />}
          label="Active agencies"
          value="42"
          helper="+3 this month"
        />
        <MetricCard
          tone="blue"
          icon={<Users className="h-5 w-5" />}
          label="Total talent"
          value="1,284"
          helper="Across all agencies"
        />
        <MetricCard
          tone="purple"
          icon={<FileText className="h-5 w-5" />}
          label="Documents stored"
          value="58,907"
          helper="Aggregate count only"
        />
        <MetricCard
          tone="amber"
          icon={<AlertCircle className="h-5 w-5" />}
          label="Action items"
          value="7"
          helper="See notification bell"
        />
      </div>

      <div className="mb-7">
        <Callout
          tone="teal"
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Admin reporting is aggregate only"
        >
          You can see counts, statuses and metadata, but never the contents of
          a talent's Private Vault. Document access is governed by each
          agency's permissions.
        </Callout>
      </div>

      <div className="tv-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <div className="text-[15px] font-black text-ink">Agencies</div>
            <div className="text-[12px] text-muted-fg">
              Status, talent count and document totals
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
                <th className="px-5 py-3 font-black">Agency</th>
                <th className="px-5 py-3 font-black">Contact</th>
                <th className="px-5 py-3 font-black text-right">Talent</th>
                <th className="px-5 py-3 font-black text-right">Documents</th>
                <th className="px-5 py-3 font-black">Status</th>
                <th className="px-5 py-3 font-black"></th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.name} className="border-t border-line">
                  <td className="px-5 py-4">
                    <div className="text-[14px] font-black text-ink">
                      {a.name}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-text-body">
                    {a.contact}
                  </td>
                  <td className="px-5 py-4 text-[13px] text-text-body text-right tabular-nums">
                    {a.talent}
                  </td>
                  <td className="px-5 py-4 text-[13px] text-text-body text-right tabular-nums">
                    {a.docs.toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    {a.status === "active" && (
                      <StatusPill tone="green" label="Active" />
                    )}
                    {a.status === "onboarding" && (
                      <StatusPill tone="blue" label="Onboarding" />
                    )}
                    {a.status === "suspended" && (
                      <StatusPill tone="red" label="Suspended" />
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button className="tv-icon-btn" aria-label="More">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalShell>
  );
}
