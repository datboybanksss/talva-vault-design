import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useRouterState, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  LayoutGrid,
  Lock,
  Share2,
  Wallet,
  Settings as SettingsIcon,
  Bell,
  LogOut,
  ShieldCheck,
  Sparkles,
  Clock,
  Upload,
} from "lucide-react";

type NavItem = {
  to: string;
  label: ReactNode;
  icon: ReactNode;
  badge?: number;
  match?: string;
};

const manage: NavItem[] = [
  { to: "/talent", label: "Dashboard", icon: <LayoutGrid />, match: "exact" },
  { to: "/talent/vault", label: "Vault", icon: <Lock />, badge: 31 },
  { to: "/talent/sharing", label: <>Shared<br />Access</>, icon: <Share2 />, badge: 3 },
  { to: "/talent/budget", label: <>Budget &<br />Income</>, icon: <Wallet /> },
];

const settings: NavItem[] = [
  { to: "/talent/settings", label: "Settings", icon: <SettingsIcon /> },
];

const notifications = [
  { tone: "purple", Icon: Sparkles, title: "4 AI suggestions need review", detail: "Confirm folder and reminder suggestions." },
  { tone: "amber", Icon: Clock, title: "2 documents expiring soon", detail: "Passport and contract reminders need attention." },
  { tone: "blue", Icon: Upload, title: "Agency requested a document", detail: "Updated passport requested by Mbeki Sports Management." },
];

export function TalentShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Loader data from /talent route: { profile, link, agency }
  const rootMatch = useRouterState({
    select: (s) => s.matches.find((m) => m.routeId === "/talent"),
  });
  const ctx = (rootMatch?.loaderData ?? null) as
    | { profile: { full_name: string; email: string | null } | null; agency: { name: string } | null }
    | null;
  const displayName = ctx?.profile?.full_name ?? "Talent";
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "T";
  const agencyName = ctx?.agency?.name ?? "Talent Vault";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

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
        {item.badge !== undefined && <span className="tvp-nav-badge">{item.badge}</span>}
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

        <Link to="/talent" className="tvp-brand">
          <div className="tvp-brand-mark">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="tvp-brand-copy">
            <div className="tvp-brand-title">TalVault</div>
            <div className="tvp-brand-sub">TALENT</div>
          </div>
        </Link>

        <div className="tvp-nav-title">MANAGE</div>
        <nav className="tvp-nav">{renderNav(manage)}</nav>

        <div className="tvp-nav-title tvp-settings">SETTINGS</div>
        <nav className="tvp-nav">{renderNav(settings)}</nav>

        <div className="tvp-sidebar-footer">
          <div className="tvp-avatar">{initials}</div>
          <div className="tvp-profile-copy">
            <div className="tvp-profile-name">{displayName}</div>
            <div className="tvp-profile-role">{agencyName}</div>
          </div>
          <button className="tvp-logout" aria-label="Log out" onClick={handleSignOut}>
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
              <span className="tvp-dot">5</span>
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
          <div className="tvp-user-dot">{initials}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
