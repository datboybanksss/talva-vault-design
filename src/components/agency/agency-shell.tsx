import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agencyWhoami, listAgencyNotifications } from "@/lib/agency.functions";

type NavItem = {
  to: string;
  label: ReactNode;
  icon: ReactNode;
  match?: string;
};

const manage: NavItem[] = [
  { to: "/agency", label: "Dashboard", icon: <LayoutGrid />, match: "exact" },
  { to: "/agency/talent", label: "Talent", icon: <Users /> },
  { to: "/agency/invitations", label: "Invitations", icon: <Send /> },
  { to: "/agency/document-vault", label: "Document Vault", icon: <Folder /> },
  {
    to: "/agency/quotes-invoices",
    label: (
      <>
        Quotes &<br />Invoices
      </>
    ),
    icon: <Receipt />,
  },
];

const settings: NavItem[] = [
  { to: "/agency/folder-templates", label: "Folder Templates", icon: <FolderCog /> },
  { to: "/agency/settings", label: "Settings", icon: <SettingsIcon /> },
];

const toneIcon: Record<string, any> = {
  amber: Clock,
  red: AlertTriangle,
  blue: Users,
  purple: Info,
  teal: ShieldCheck,
  green: Info,
};

export function AgencyShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const whoamiFn = useServerFn(agencyWhoami);
  const listNotifsFn = useServerFn(listAgencyNotifications);

  const { data: me } = useQuery({
    queryKey: ["agency", "whoami"],
    queryFn: () => whoamiFn(),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: notifs } = useQuery({
    queryKey: ["agency", "notifications"],
    queryFn: () => listNotifsFn(),
    refetchInterval: 60_000,
  });

  const items = [
    ...(notifs?.computed ?? []),
    ...(notifs?.persisted ?? []),
  ];

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

  const renderNav = (list: NavItem[]) =>
    list.map((item) => (
      <Link
        key={item.to}
        to={item.to}
        className={`tvp-nav-item${isActive(item) ? " tvp-active" : ""}`}
      >
        <span className="shrink-0">{item.icon}</span>
        <span className="tvp-nav-label">{item.label}</span>
      </Link>
    ));

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (me?.displayName || me?.email || "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  const roleLabel =
    me?.role === "owner"
      ? "Agency Owner"
      : me?.role === "manager"
        ? "Manager"
        : me?.role
          ? "Staff"
          : "";

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
          <div className="tvp-avatar">{initials || "?"}</div>
          <div className="tvp-profile-copy">
            <div className="tvp-profile-name">
              {me?.displayName || me?.email?.split("@")[0] || "Loading..."}
            </div>
            <div className="tvp-profile-role">{roleLabel}</div>
          </div>
          <button
            className="tvp-logout"
            aria-label="Log out"
            onClick={handleSignOut}
          >
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
              {items.length > 0 && <span className="tvp-dot">{items.length}</span>}
            </button>
            {bellOpen && (
              <div className="tvp-notification-panel">
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: 6 }}
                >
                  <div className="tvp-h2">Reminders</div>
                </div>
                {items.length === 0 && (
                  <div className="tvp-muted" style={{ padding: "10px 2px" }}>
                    All caught up.
                  </div>
                )}
                {items.map((n: any) => {
                  const Icon = toneIcon[n.tone] ?? Info;
                  return (
                    <div className="tvp-notification-item" key={n.id ?? n.title}>
                      <div
                        className={`tvp-kpi-icon tvp-bg-${n.tone} shrink-0`}
                        style={{ width: 32, height: 32 }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="tvp-notification-text">
                        <strong>{n.title}</strong>
                        <div
                          className="tvp-muted"
                          style={{ fontSize: 12, marginTop: 2 }}
                        >
                          {n.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div
            className="tvp-user-dot"
            aria-label="My account"
            title={me?.displayName || me?.email || "My account"}
          >
            {initials || "?"}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
