import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  LayoutGrid,
  Building2,
  Send,
  ScrollText,
  ShieldCheck,
  Bell,
  LogOut,
  AlertTriangle,
  Info,
  Clock,
  Users,
} from "lucide-react";

type NavItem = {
  to: string;
  label: ReactNode;
  icon: ReactNode;
  badge?: number;
  match?: string;
};

const manage: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: <LayoutGrid />, match: "exact" },
  { to: "/admin/agencies", label: "Agencies", icon: <Building2 />, badge: 9 },
  { to: "/admin/invitations", label: <>Agency<br />Invitations</>, icon: <Send />, badge: 3 },
  { to: "/admin/audit", label: "Audit & Support Log", icon: <ScrollText /> },
];

const settings: NavItem[] = [
  { to: "/admin/administrators", label: "Administrators", icon: <ShieldCheck /> },
];

type Notification = {
  id: string;
  tone: string;
  title: string;
  detail: string;
  rule: string;
  to?: string;
};

const initialNotifications: Notification[] = [
  { id: "bell-001", tone: "amber", title: "2 agency invites expiring soon", detail: "Within the configured reminder window.", rule: "BR-BELL-001", to: "/admin/invitations" },
  { id: "bell-002", tone: "red", title: "1 agency invite expired", detail: "Requires resend, correction, or close-out.", rule: "BR-BELL-002", to: "/admin/invitations" },
  { id: "bell-003", tone: "purple", title: "5 agencies incomplete", detail: "Onboarding or document review outstanding.", rule: "BR-BELL-003", to: "/admin/agencies" },
  { id: "bell-004", tone: "blue", title: "2 Talent invites pending too long", detail: "From agency-level Talent invite records.", rule: "BR-BELL-004", to: "/admin/agencies" },
  { id: "bell-005", tone: "red", title: "1 suspended agency needs review", detail: "Suspension follow-up outstanding.", rule: "BR-BELL-005", to: "/admin/agencies" },
  { id: "bell-006", tone: "teal", title: "Legal / copy review reminder", detail: "T&Cs and privacy disclaimers due review.", rule: "BR-BELL-006" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const dismissNotification = (id: string) =>
    setNotifications((ns) => ns.filter((n) => n.id !== id));

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

        <Link to="/admin" className="tvp-brand">
          <div className="tvp-brand-mark">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="tvp-brand-copy">
            <div className="tvp-brand-title">TalVault</div>
            <div className="tvp-brand-sub">ADMIN</div>
          </div>
        </Link>

        <div className="tvp-nav-title">MANAGE</div>
        <nav className="tvp-nav">{renderNav(manage)}</nav>

        <div className="tvp-nav-title tvp-settings">SETTINGS</div>
        <nav className="tvp-nav">{renderNav(settings)}</nav>

        <div className="tvp-sidebar-footer">
          <div className="tvp-avatar">IN</div>
          <div className="tvp-profile-copy">
            <div className="tvp-profile-name">Israel Noko</div>
            <div className="tvp-profile-role">Main Administrator</div>
          </div>
          <button className="tvp-logout" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="tvp-main">
        <div
          className="flex items-center gap-3 justify-end mb-2"
          ref={wrapRef}
        >
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
              {notifications.length > 0 && (
                <span className="tvp-dot">{notifications.length}</span>
              )}
            </button>
            {bellOpen && (
              <div className="tvp-notification-panel">
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: 6 }}
                >
                  <div className="tvp-h2">Admin Reminders</div>
                  <Link to="/admin/audit" className="tvp-link">
                    View audit log
                  </Link>
                </div>
                {notifications.length === 0 && (
                  <div className="tvp-muted" style={{ padding: "10px 2px" }}>
                    All caught up. New reminders appear here per BR-BELL-001…006.
                  </div>
                )}
                {notifications.map((n) => {
                  const Icon =
                    n.tone === "amber" ? Clock :
                    n.tone === "red" ? AlertTriangle :
                    n.tone === "blue" ? Users :
                    n.tone === "purple" ? Info :
                    Info;
                  const body = (
                    <>
                      <div className={`tvp-kpi-icon tvp-bg-${n.tone}`} style={{ width: 32, height: 32 }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <strong>{n.title}</strong>
                        <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {n.detail} <span style={{ opacity: 0.7 }}>· {n.rule}</span>
                        </div>
                      </div>
                    </>
                  );
                  return (
                    <div
                      className="tvp-notification-item"
                      key={n.id}
                      style={{ alignItems: "flex-start", gap: 8 }}
                    >
                      {n.to ? (
                        <Link
                          to={n.to}
                          onClick={() => setBellOpen(false)}
                          style={{ display: "flex", gap: 10, flex: 1, textDecoration: "none", color: "inherit" }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div style={{ display: "flex", gap: 10, flex: 1 }}>{body}</div>
                      )}
                      <button
                        className="tvp-mini-btn"
                        title="Dismiss reminder"
                        aria-label="Dismiss reminder"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(n.id);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="tvp-user-dot">IN</div>
        </div>
        {children}
      </main>
    </div>
  );
}
