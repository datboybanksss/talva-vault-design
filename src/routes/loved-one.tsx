import { createFileRoute } from "@tanstack/react-router";
import {
  Callout,
  PageHeader,
  PortalShell,
  StatusPill,
  type NavItem,
  type Notification,
} from "@/components/portal-shell";
import {
  Clock,
  Download,
  Eye,
  FileText,
  Heart,
  Inbox,
  Info,
  KeyRound,
  Lock,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/loved-one")({
  head: () => ({
    meta: [
      { title: "Loved One · TalVault" },
      {
        name: "description",
        content:
          "Limited, time-bound access to documents specifically shared with you.",
      },
    ],
  }),
  component: LovedOnePortal,
});

const nav: NavItem[] = [
  { to: "/loved-one", label: "Shared with me", icon: <Inbox className="h-4 w-4" /> },
  { to: "/loved-one/access", label: "Access info", icon: <KeyRound className="h-4 w-4" /> },
];

const notifications: Notification[] = [
  {
    id: "1",
    title: "Your access expires in 4 days",
    detail: "Medical folder shared by Maya Chen",
    tone: "amber",
    time: "Today",
  },
  {
    id: "2",
    title: "Document downloads enabled",
    detail: "You can now download Will_2025.pdf",
    tone: "blue",
    time: "Yesterday",
  },
];

type SharedItem = {
  name: string;
  type: string;
  shared: string;
  download: boolean;
  state: "active" | "expiring" | "revoked";
};

const items: SharedItem[] = [
  {
    name: "Will_2025.pdf",
    type: "Legal · PDF",
    shared: "by Maya Chen · shared 12 Jan",
    download: true,
    state: "active",
  },
  {
    name: "Medical_Records_Summary.pdf",
    type: "Medical · PDF",
    shared: "by Maya Chen · shared 4 Feb",
    download: false,
    state: "expiring",
  },
  {
    name: "Travel_Insurance_2024.pdf",
    type: "Travel · PDF",
    shared: "by Maya Chen · shared 10 Nov",
    download: false,
    state: "revoked",
  },
];

function LovedOnePortal() {
  return (
    <PortalShell
      brand="TalVault"
      roleLabel="Loved One"
      nav={nav}
      notifications={notifications}
      user={{ name: "Helen Chen", meta: "Trusted contact", initials: "HC" }}
    >
      <PageHeader
        eyebrow="Limited, secure access"
        title="Shared with you"
        subtitle="Maya Chen has shared a small set of documents with you. Your access is time-bound and uses a separate code."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-7">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div key={item.name} className="tv-card p-5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
                <div
                  className="grid place-items-center h-12 w-12 rounded-xl shrink-0"
                  style={{
                    background:
                      item.state === "revoked"
                        ? "var(--red-bg)"
                        : "var(--teal-100)",
                    color:
                      item.state === "revoked" ? "var(--red)" : "var(--teal)",
                  }}
                >
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-black text-ink truncate">
                    {item.name}
                  </div>
                  <div className="text-[12px] text-muted-fg mt-0.5">
                    {item.type} · {item.shared}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {item.state === "active" && (
                      <StatusPill tone="green" label="Active access" />
                    )}
                    {item.state === "expiring" && (
                      <StatusPill
                        tone="amber"
                        label="Expires in 4 days"
                        icon={<Clock className="h-3 w-3" />}
                      />
                    )}
                    {item.state === "revoked" && (
                      <StatusPill tone="red" label="Access revoked" />
                    )}
                    {item.download ? (
                      <StatusPill tone="blue" label="Download allowed" />
                    ) : (
                      <StatusPill
                        tone="teal"
                        label="View only"
                        icon={<Lock className="h-3 w-3" />}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    className="tv-icon-btn"
                    aria-label="Preview"
                    disabled={item.state === "revoked"}
                    style={
                      item.state === "revoked"
                        ? { opacity: 0.45, cursor: "not-allowed" }
                        : undefined
                    }
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    className="tv-icon-btn"
                    aria-label="Download"
                    disabled={!item.download || item.state === "revoked"}
                    style={
                      !item.download || item.state === "revoked"
                        ? { opacity: 0.45, cursor: "not-allowed" }
                        : undefined
                    }
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="tv-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="h-4 w-4 text-teal" />
              <div className="text-[14px] font-black text-ink">
                Your access summary
              </div>
            </div>
            <dl className="space-y-3 text-[13px]">
              <Row label="Shared by" value="Maya Chen" />
              <Row label="Permission" value="View · Download (selected)" />
              <Row label="Expires" value="Sun, 14 Apr 2026" />
              <Row label="Access code" value="•••• 4821 (separate)" />
            </dl>
            <button className="mt-5 tv-btn-secondary w-full justify-center">
              Request extension
            </button>
          </div>

          <Callout
            tone="teal"
            icon={<ShieldCheck className="h-5 w-5" />}
            title="This is not a full TalVault account"
          >
            You only see what Maya has chosen to share, for the time she set.
            You can't browse other folders, and Maya can revoke access at any
            moment.
          </Callout>

          <Callout
            tone="blue"
            icon={<Info className="h-5 w-5" />}
            title="Need help?"
          >
            Email <span className="font-black">support@talvault.com</span> if
            something looks wrong or you can't open a document.
          </Callout>
        </div>
      </div>
    </PortalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-fg font-bold">{label}</dt>
      <dd className="text-ink font-black truncate">{value}</dd>
    </div>
  );
}
