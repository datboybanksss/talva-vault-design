import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, ChevronLeft, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

export type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
};

export type Notification = {
  id: string;
  title: string;
  detail: string;
  tone: "amber" | "red" | "blue" | "purple" | "teal";
  time: string;
};

type PortalShellProps = {
  brand: string;
  roleLabel: string;
  nav: NavItem[];
  notifications: Notification[];
  user: { name: string; meta: string; initials: string };
  children: ReactNode;
};

const toneClasses: Record<Notification["tone"], string> = {
  amber: "bg-tv-amber-bg text-tv-amber",
  red: "bg-tv-red-bg text-tv-red",
  blue: "bg-tv-blue-bg text-tv-blue",
  purple: "bg-tv-purple-bg text-tv-purple",
  teal: "bg-teal-100 text-teal",
};

export function PortalShell({
  brand,
  roleLabel,
  nav,
  notifications,
  user,
  children,
}: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div
      className="min-h-screen w-full"
      style={{
        display: "grid",
        gridTemplateColumns: `${collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)"} minmax(0, 1fr)`,
        background: "var(--bg)",
      }}
    >
      {/* Sidebar */}
      <aside
        className="hidden md:flex sticky top-0 h-screen flex-col text-white"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <div className="flex items-center justify-between px-5 pt-7 pb-5">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <div
              className="grid place-items-center shrink-0 rounded-xl"
              style={{
                width: 42,
                height: 42,
                background: "var(--sidebar-active)",
              }}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-[15px] font-black tracking-tight truncate">
                  {brand}
                </div>
                <div
                  className="text-[11px] font-bold uppercase tracking-wider truncate"
                  style={{ color: "var(--sidebar-muted)" }}
                >
                  {roleLabel}
                </div>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="tv-focus-ring grid place-items-center h-8 w-8 rounded-lg hover:bg-white/10"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {nav.map((item) => {
            const active =
              pathname === item.to ||
              (item.to !== "/" && pathname.startsWith(item.to + "/"));
            return (
              <Link
                key={item.to}
                to={item.to}
                className="tv-focus-ring flex items-center gap-3 px-3 rounded-2xl h-12 transition-colors"
                style={{
                  background: active ? "var(--sidebar-active)" : "transparent",
                  color: active ? "#fff" : "#D6ECEE",
                  fontWeight: active ? 850 : 600,
                }}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && (
                  <span className="truncate text-[14px]">{item.label}</span>
                )}
                {!collapsed && item.badge !== undefined && (
                  <span
                    className="ml-auto text-[11px] font-black px-2 py-0.5 rounded-full"
                    style={{
                      background: active
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.10)",
                      color: "#fff",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className="m-3 p-3 rounded-2xl flex items-center gap-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="grid place-items-center shrink-0 rounded-full font-black"
            style={{
              width: 38,
              height: 38,
              background: "var(--sidebar-active)",
            }}
          >
            {user.initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-black truncate">{user.name}</div>
              <div
                className="text-[11px] truncate"
                style={{ color: "var(--sidebar-muted)" }}
              >
                {user.meta}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 backdrop-blur bg-[color:var(--bg)]/85 border-b border-line">
          <div className="flex items-center gap-3 px-5 md:px-9 py-4">
            <div className="flex-1 min-w-0 max-w-xl relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: "var(--muted-fg)" }}
              />
              <input
                placeholder="Search documents, talent, agencies…"
                className="tv-input pl-10"
                style={{ background: "#fff" }}
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setBellOpen((o) => !o)}
                className="tv-icon-btn relative tv-focus-ring"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-[10px] font-black rounded-full px-1.5 py-0.5"
                    style={{ background: "var(--red)", color: "#fff" }}
                  >
                    {notifications.length}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div
                  className="absolute right-0 mt-2 w-[360px] tv-card overflow-hidden z-30"
                  style={{ boxShadow: "var(--shadow-tv-card)" }}
                >
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <div className="text-[14px] font-black text-ink">
                      Notifications
                    </div>
                    <span className="text-[11px] text-muted-fg font-bold">
                      {notifications.length} active
                    </span>
                  </div>
                  <ul className="max-h-[360px] overflow-y-auto divide-y divide-line">
                    {notifications.map((n) => (
                      <li key={n.id} className="px-4 py-3 hover:bg-surface-soft">
                        <div className="flex items-start gap-3">
                          <span
                            className={`tv-pill ${toneClasses[n.tone]} shrink-0`}
                          >
                            {n.tone === "purple"
                              ? "AI"
                              : n.tone === "red"
                                ? "Urgent"
                                : n.tone === "amber"
                                  ? "Soon"
                                  : n.tone === "blue"
                                    ? "Info"
                                    : "Reminder"}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-black text-ink leading-tight">
                              {n.title}
                            </div>
                            <div className="text-[12px] text-muted-fg mt-0.5">
                              {n.detail}
                            </div>
                            <div className="text-[11px] text-muted-fg mt-1 font-bold">
                              {n.time}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 md:px-9 py-7 md:py-9 pb-24">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Building blocks                                                           */
/* ------------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 mb-7">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-teal mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] md:text-[30px] font-black text-ink leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] text-muted-fg mt-1.5 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  helper,
  tone = "teal",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
  tone?: "teal" | "blue" | "green" | "amber" | "purple";
}) {
  const toneBg: Record<string, string> = {
    teal: "bg-teal-100 text-teal",
    blue: "bg-tv-blue-bg text-tv-blue",
    green: "bg-tv-green-bg text-tv-green",
    amber: "bg-tv-amber-bg text-tv-amber",
    purple: "bg-tv-purple-bg text-tv-purple",
  };
  return (
    <div className="tv-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`grid place-items-center rounded-xl h-11 w-11 ${toneBg[tone]}`}
        >
          {icon}
        </div>
        <div className="text-[12px] font-black uppercase tracking-wider text-muted-fg">
          {label}
        </div>
      </div>
      <div className="text-[30px] font-black text-ink leading-none">
        {value}
      </div>
      {helper && (
        <div className="text-[12px] text-muted-fg mt-2 font-semibold">
          {helper}
        </div>
      )}
    </div>
  );
}

export function StatusPill({
  tone,
  label,
  icon,
}: {
  tone: "green" | "blue" | "teal" | "amber" | "red" | "purple";
  label: string;
  icon?: ReactNode;
}) {
  const map: Record<string, string> = {
    green: "bg-tv-green-bg text-tv-green",
    blue: "bg-tv-blue-bg text-tv-blue",
    teal: "bg-teal-100 text-teal",
    amber: "bg-tv-amber-bg text-tv-amber",
    red: "bg-tv-red-bg text-tv-red",
    purple: "bg-tv-purple-bg text-tv-purple",
  };
  return (
    <span className={`tv-pill ${map[tone]}`}>
      {icon}
      {label}
    </span>
  );
}

export function Callout({
  tone = "blue",
  icon,
  title,
  children,
}: {
  tone?: "blue" | "teal" | "amber" | "purple";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const styles: Record<string, { bg: string; border: string; fg: string }> = {
    blue: { bg: "#F7FBFF", border: "#BBD7F8", fg: "#1E40AF" },
    teal: { bg: "#EFF8F9", border: "#BEDADD", fg: "#086A70" },
    amber: { bg: "#FFFBF1", border: "#F4D8A8", fg: "#92400E" },
    purple: { bg: "#F7F4FE", border: "#D6CAF7", fg: "#5B21B6" },
  };
  const s = styles[tone];
  return (
    <div
      className="rounded-2xl p-4 flex gap-3 items-start"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <div
        className="grid place-items-center h-9 w-9 rounded-xl shrink-0"
        style={{ background: "#fff", color: s.fg }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-black" style={{ color: s.fg }}>
          {title}
        </div>
        <div className="text-[13px] text-text-body mt-1 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
