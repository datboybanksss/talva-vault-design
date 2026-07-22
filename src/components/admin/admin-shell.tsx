import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  LayoutGrid,
  Building2,
  Send,
  ScrollText,
  FileText,
  ShieldCheck,
  Bell,
  LogOut,
  AlertTriangle,
  Info,
  Clock,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whoami, listNotifications, dismissNotification, dismissComputedNotification } from "@/lib/admin.functions";

type NavItem = {
  to: string;
  label: ReactNode;
  icon: ReactNode;
  match?: string;
};

const manage: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: <LayoutGrid />, match: "exact" },
  { to: "/admin/agencies", label: "Agencies", icon: <Building2 /> },
  {
    to: "/admin/invitations",
    label: (
      <>
        Agency
        <br />
        Invitations
      </>
    ),
    icon: <Send />,
  },
  {
    to: "/admin/quotes-invoices",
    label: (
      <>
        Quotes &<br />
        Invoices
      </>
    ),
    icon: <FileText />,
  },
  { to: "/admin/audit", label: "Audit & Support Log", icon: <ScrollText /> },
];

const settings: NavItem[] = [
  { to: "/admin/administrators", label: "Administrators", icon: <ShieldCheck /> },
];

const toneIcon: Record<string, any> = {
  amber: Clock,
  red: AlertTriangle,
  blue: Users,
  purple: Info,
  teal: ShieldCheck,
  green: Info,
};

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const whoamiFn = useServerFn(whoami);
  const listNotificationsFn = useServerFn(listNotifications);
  const dismissFn = useServerFn(dismissNotification);
  const dismissComputedFn = useServerFn(dismissComputedNotification);

  const { data: me } = useQuery({
    queryKey: ["whoami"],
    queryFn: () => whoamiFn(),
    refetchOnMount: "always",
    staleTime: 0,
  });
  const { data: notifs } = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => listNotificationsFn(),
    refetchInterval: 60_000,
  });

  const dismissM = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });

  const dismissComputedM = useMutation({
    mutationFn: (v: { kind: string; snapshot: number }) => dismissComputedFn({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });

  const items = [
    ...(notifs?.computed ?? []).map((c: any) => ({ ...c, persisted: false })),
    ...(notifs?.persisted ?? []).map((p: any) => ({
      id: p.id,
      persisted: true,
      kind: p.kind,
      tone:
        p.kind === "suspended_review"
          ? "red"
          : p.kind === "invite_expired"
            ? "red"
            : p.kind === "invite_expiring"
              ? "amber"
              : "blue",
      title: p.title,
      detail: p.detail ?? "",
      to: p.target_type === "agency" ? "/admin/agencies" : undefined,
    })),
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
          <div className="tvp-avatar">{initials || "?"}</div>
          <div className="tvp-profile-copy">
            <div className="tvp-profile-name">
              {me?.displayName || me?.email?.split("@")[0] || "Loading..."}
            </div>
            <div className="tvp-profile-role">
              {me?.isMainAdmin ? "Main Administrator" : me?.isAdmin ? "Administrator" : ""}
            </div>
          </div>
          <button className="tvp-logout" aria-label="Log out" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="tvp-main">
        <div className="flex items-center gap-3 justify-end mb-2" ref={wrapRef}>
          {me?.isAdmin && !me?.canEdit && (
            <span
              className="tvp-status tvp-amber"
              title="You have view-only access. Write actions are disabled."
              style={{ marginRight: "auto" }}
            >
              View only — no edit access
            </span>
          )}
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
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div className="tvp-h2">Admin Reminders</div>
                  <Link to="/admin/audit" className="tvp-link">
                    View audit log
                  </Link>
                </div>
                {items.length === 0 && (
                  <div className="tvp-muted" style={{ padding: "10px 2px" }}>
                    All caught up.
                  </div>
                )}
                {items.map((n) => {
                  const Icon = toneIcon[n.tone] ?? Info;
                  const body = (
                    <>
                      <div
                        className={`tvp-kpi-icon tvp-bg-${n.tone} shrink-0`}
                        style={{ width: 32, height: 32 }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="tvp-notification-text">
                        <strong>{n.title}</strong>
                        <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {n.detail}
                        </div>
                      </div>
                    </>
                  );
                  return (
                    <div className="tvp-notification-item" key={n.id}>
                      {n.to ? (
                        <Link to={n.to} onClick={() => setBellOpen(false)}>
                          {body}
                        </Link>
                      ) : (
                        <div className="tvp-notification-body">{body}</div>
                      )}
                      {n.persisted && (
                        <button
                          className="tvp-mini-btn"
                          title="Dismiss"
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissM.mutate(n.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Link
            to="/admin/my-account"
            className="tvp-user-dot"
            aria-label="My account"
            title={me?.displayName || me?.email || "My account"}
          >
            {initials || "?"}
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}
