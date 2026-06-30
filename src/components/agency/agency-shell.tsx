import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  LayoutGrid,
  Users,
  Send,
  Folder,
  Receipt,
  FolderCog,
  Settings as SettingsIcon,
  Bell,
  LogOut,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";

type NavItem = {
  to: string;
  label: ReactNode;
  icon: ReactNode;
  badge?: number;
  match?: string;
};

const manage: NavItem[] = [
  { to: "/agency", label: "Dashboard", icon: <LayoutGrid />, match: "exact" },
  { to: "/agency/talent", label: "Talent", icon: <Users />, badge: 24 },
  { to: "/agency/invitations", label: "Invitations", icon: <Send />, badge: 6 },
  { to: "/agency/document-vault", label: "Document Vault", icon: <Folder /> },
  { to: "/agency/quotes-invoices", label: <>Quotes &<br />Invoices</>, icon: <Receipt /> },
];

const settings: NavItem[] = [
  { to: "/agency/folder-templates", label: "Folder Templates", icon: <FolderCog /> },
  { to: "/agency/settings", label: "Settings", icon: <SettingsIcon /> },
];

const notifications = [
  { tone: "amber", Icon: AlertTriangle, title: "6 invitations need action", detail: "3 Talent invites expiring soon · 2 Staff invites awaiting acceptance" },
  { tone: "blue", Icon: Info, title: "8 documents need review", detail: "AI suggestions require confirmation before filing." },
  { tone: "green", Icon: CheckCircle2, title: "4 rules need confirmation", detail: "Document validity rules still need Agency owner confirmation." },
  { tone: "red", Icon: AlertTriangle, title: "2 invoices marked late", detail: "Review and capture updated payment status manually." },
];

export function AgencyShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const isActive = (item: NavItem) => {
    if (item.match === "exact") return pathname === item.to;
    return pathname === item.to || pathname.startsWith(item.to + "/");
  };

  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <Link
        key={item.to}
        to={item.to}
        className={`tvp-nav-item${isActive(item) ? " tvp-active" : ""}`}
      >
        <span className="shrink-0">{item.icon}</span>
        <span className="tvp-nav-label">{item.label}</span>
        {item.badge !== undefined && (
          <span className="tvp-nav-badge">{item.badge}</span>
        )}
      </Link>
    ));

  return (
    <div className={`tv-app${collapsed ? " tv-collapsed" : ""}`}>
      <aside className="tvp-sidebar">
        <button
          className="tvp-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <Link to="/agency" className="tvp-brand">
          <div className="tvp-brand-mark">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="tvp-brand-copy">
            <div className="tvp-brand-title">TalVault</div>
            <div className="tvp-brand-sub">AGENCY</div>
          </div>
        </Link>

        <div className="tvp-nav-title">MANAGE</div>
        <nav className="tvp-nav">{renderNav(manage)}</nav>

        <div className="tvp-nav-title tvp-settings">SETTINGS</div>
        <nav className="tvp-nav">{renderNav(settings)}</nav>

        <div className="tvp-sidebar-footer">
          <div className="tvp-avatar">TN</div>
          <div className="tvp-profile-copy">
            <div className="tvp-profile-name">Thandi Ndlovu</div>
            <div className="tvp-profile-role">Agency Owner</div>
          </div>
          <button className="tvp-logout" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="tvp-main">
        <div className="flex items-center gap-3 justify-end mb-2" ref={wrapRef}>
          <input className="tvp-search-top" placeholder="Search..." />
          <div className="tvp-notification-wrap">
            <button
              className="tvp-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setBellOpen((o) => !o);
              }}
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="tvp-dot">4</span>
            </button>
            {bellOpen && (
              <div className="tvp-notification-panel">
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div className="tvp-h2">Reminders</div>
                  <button className="tvp-link">View all</button>
                </div>
                {notifications.map((n, i) => (
                  <div className="tvp-notification-item" key={i}>
                    <div className={`tvp-kpi-icon tvp-bg-${n.tone}`} style={{ width: 32, height: 32 }}>
                      <n.Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <strong>{n.title}</strong>
                      <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {n.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="tvp-user-dot">TN</div>
        </div>
        {children}
      </main>
    </div>
  );
}
