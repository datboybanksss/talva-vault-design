import { createFileRoute } from "@tanstack/react-router";
import { Download, Activity, Users2, ShieldAlert, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit & Support Log · TalVault Admin" }] }),
  component: AuditPage,
});

const actionArea: Record<string, { area: string; tone: string; severity: string; sevTone: string }> = {
  suspend_agency: { area: "Agencies", tone: "teal", severity: "High", sevTone: "red" },
  unsuspend_agency: { area: "Agencies", tone: "teal", severity: "Medium", sevTone: "amber" },
  view_agency: { area: "Agencies", tone: "teal", severity: "Low", sevTone: "green" },
  create_agency_invitation: { area: "Invitations", tone: "blue", severity: "Medium", sevTone: "amber" },
  resend_invitation: { area: "Invitations", tone: "blue", severity: "Low", sevTone: "green" },
  revoke_invitation: { area: "Invitations", tone: "blue", severity: "Medium", sevTone: "amber" },
  update_invitation_email: { area: "Invitations", tone: "blue", severity: "Medium", sevTone: "amber" },
  copy_invitation_link: { area: "Invitations", tone: "blue", severity: "Low", sevTone: "green" },
  view_quotes_invoices: { area: "Reporting", tone: "purple", severity: "Low", sevTone: "green" },
  export_quotes_invoices: { area: "Reporting", tone: "purple", severity: "Medium", sevTone: "amber" },
  approve_legal_copy: { area: "Legal & Copy", tone: "teal", severity: "Medium", sevTone: "amber" },
};

function humanAction(a: string) {
  return a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AuditPage() {
  const listFn = useServerFn(listAuditLog);
  const q = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const events = q.data ?? [];

  const areaOf = (a: string) => actionArea[a]?.area ?? "System";
  const severityOf = (a: string) => actionArea[a]?.severity ?? "Low";

  const areaCounts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) {
      const area = areaOf(e.action);
      c[area] = (c[area] ?? 0) + 1;
    }
    return c;
  }, [events]);

  const kpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventsToday = events.filter((e: any) => new Date(e.created_at) >= today).length;
    const highSeverity = events.filter((e: any) => severityOf(e.action) === "High").length;
    const distinctActors = new Set(events.map((e: any) => e.actor_email ?? "system")).size;
    return {
      total: events.length,
      eventsToday,
      highSeverity,
      distinctActors,
    };
  }, [events]);

  const visible = useMemo(
    () =>
      events.filter((e: any) => {
        if (areaFilter !== "all" && areaOf(e.action) !== areaFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (e.actor_email ?? "").toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          (e.target_label ?? "").toLowerCase().includes(q)
        );
      }),
    [events, search, areaFilter],
  );

  const filtersActive = areaFilter !== "all" || !!search;
  const resetFilters = () => { setAreaFilter("all"); setSearch(""); };

  const selected =
    events.find((e: any) => e.id === selectedId) ?? visible[0] ?? null;

  const exportCsv = () => {
    const headers = ["Time", "Actor", "Action", "Target", "Detail"];
    const rows = visible.map((e: any) => [
      new Date(e.created_at).toISOString(),
      e.actor_email ?? "",
      e.action,
      e.target_label ?? "",
      JSON.stringify(e.detail ?? {}),
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Audit & Support Log</h1>
          <div className="tvp-subtitle">
            Every admin view, export, and action is recorded — actor, timestamp, and target.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />Export Log
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><Activity className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.total}</div>
            <div className="tvp-kpi-label">Total Events</div>
            <div className="tvp-kpi-sub" style={{ color: "var(--tvp-muted)" }}>Immutable audit trail</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.eventsToday}</div>
            <div className="tvp-kpi-label">Events Today</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.eventsToday > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {kpis.eventsToday > 0 ? "Active session" : "Quiet so far"}
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-red"><ShieldAlert className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.highSeverity}</div>
            <div className="tvp-kpi-label">High-Severity Actions</div>
            <div className="tvp-kpi-sub" style={{ color: kpis.highSeverity > 0 ? "var(--tvp-red)" : "var(--tvp-green)" }}>
              {kpis.highSeverity > 0 ? "Review recommended" : "No high-severity events"}
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><Users2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{kpis.distinctActors}</div>
            <div className="tvp-kpi-label">Distinct Actors</div>
            <div className="tvp-kpi-sub" style={{ color: "var(--tvp-muted)" }}>Admins + system</div>
          </div>
        </div>
      </div>

      {/* Area chip row */}
      <div className="tvp-life-chips">
        {["all", "Agencies", "Invitations", "Reporting", "Legal & Copy", "System"].map((k) => {
          const toneMap: Record<string, string> = {
            all: "teal", Agencies: "teal", Invitations: "blue", Reporting: "purple",
            "Legal & Copy": "amber", System: "neutral",
          };
          return (
            <button
              key={k}
              className={`tvp-life-chip${areaFilter === k ? " tvp-active-filter" : ""} tvp-bg-${toneMap[k] ?? "neutral"}`}
              onClick={() => setAreaFilter(k)}
            >
              <div className="tvp-label">{k === "all" ? "All" : k}</div>
              <div className="tvp-num">{areaCounts[k] ?? 0}</div>
            </button>
          );
        })}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search actors, actions, targets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filtersActive && (
            <button className="tvp-link" onClick={resetFilters}>Reset filters</button>
          )}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 340px",
            gap: 18,
            padding: 18,
          }}
        >
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Time</th><th>Actor</th><th>Action</th><th>Area</th><th>Target</th><th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr><td colSpan={6} className="tvp-muted">Loading events…</td></tr>
                )}
                {!q.isLoading && visible.length === 0 && (
                  <tr><td colSpan={6} className="tvp-muted">No events yet.</td></tr>
                )}
                {visible.map((e: any) => {
                  const meta = actionArea[e.action] ?? {
                    area: "System", tone: "neutral", severity: "Low", sevTone: "green",
                  };
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      style={{ cursor: "pointer", background: selected?.id === e.id ? "color-mix(in oklab, var(--tvp-teal) 6%, transparent)" : undefined }}
                    >
                      <td>{new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td><strong>{e.actor_email ?? "System"}</strong></td>
                      <td>{humanAction(e.action)}</td>
                      <td><span className={`tvp-status tvp-${meta.tone}`}>{meta.area}</span></td>
                      <td>{e.target_label ?? "—"}</td>
                      <td><span className={`tvp-status tvp-${meta.sevTone}`}>{meta.severity}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="tvp-card tvp-panel tvp-settings-tight">
            <h2 className="tvp-h2">Event Details</h2>
            {selected ? (
              (() => {
                const meta = actionArea[selected.action] ?? {
                  area: "System", tone: "neutral", severity: "Low", sevTone: "green",
                };
                return (
                  <>
                    <p style={{ marginTop: 10 }}>
                      <span className={`tvp-status tvp-${meta.sevTone}`}>{meta.severity}</span>
                    </p>
                    <h3 className="tvp-h3" style={{ marginTop: 10 }}>{humanAction(selected.action)}</h3>
                    <p className="tvp-muted" style={{ fontSize: 12 }}>
                      Event ID: {selected.id}
                    </p>
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>Actor</div>
                      <p><strong>{selected.actor_email ?? "System"}</strong></p>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>Target</div>
                      <p><strong>{selected.target_label ?? "—"}</strong>
                      {selected.target_type && (
                        <><br /><span className="tvp-muted">{selected.target_type}</span></>
                      )}
                      </p>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>Detail</div>
                      <pre style={{ fontSize: 12, background: "rgba(0,0,0,0.03)", padding: 8, borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {JSON.stringify(selected.detail ?? {}, null, 2)}
                      </pre>
                    </div>
                  </>
                );
              })()
            ) : (
              <p className="tvp-muted">Select an event.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
