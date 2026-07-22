import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Mail,
  CheckCircle2,
  FileText,
  Heart,
  Ban,
  RefreshCw,
  Lock,
} from "lucide-react";
import {
  getDashboardMetrics,
  listAgencies,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Platform Overview · TalVault Admin" }] }),
  component: AdminDashboard,
});

const statusLabel: Record<string, string> = {
  incomplete: "Incomplete",
  invited: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  declined: "Declined",
  suspended: "Suspended",
};

const statusTone: Record<string, string> = {
  incomplete: "purple",
  invited: "blue",
  accepted: "green",
  expired: "amber",
  declined: "red",
  suspended: "teal",
};

function AdminDashboard() {
  const getMetricsFn = useServerFn(getDashboardMetrics);
  const listAgenciesFn = useServerFn(listAgencies);

  const metrics = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => getMetricsFn(),
    refetchInterval: 60_000,
  });
  const agencies = useQuery({
    queryKey: ["admin", "agencies"],
    queryFn: () => listAgenciesFn(),
  });

  const [filter, setFilter] = useState<string>("all");
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  const visible = useMemo(() => {
    const list = agencies.data ?? [];
    return filter === "all" ? list : list.filter((a: any) => a.status === filter);
  }, [agencies.data, filter]);

  const counts = metrics.data?.statusCounts ?? {
    incomplete: 0, invited: 0, accepted: 0, expired: 0, declined: 0, suspended: 0,
  };

  const freshnessLabel = useMemo(() => {
    const src = metrics.dataUpdatedAt ? new Date(metrics.dataUpdatedAt) : refreshedAt;
    const diffSec = Math.max(0, Math.round((Date.now() - src.getTime()) / 1000));
    if (diffSec < 60) return "just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }, [metrics.dataUpdatedAt, refreshedAt]);

  const refreshMetrics = () => {
    metrics.refetch();
    agencies.refetch();
    setRefreshedAt(new Date());
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Platform Reporting Overview</h1>
          <div className="tvp-subtitle">
            A consolidated reporting view across agencies, talent, documents and invitation activity.
          </div>
        </div>
        <div className="tvp-actions">
          <span className="tvp-muted" style={{ fontSize: 12 }}>
            Metrics refreshed {freshnessLabel}
          </span>
          <button className="tvp-secondary" onClick={refreshMetrics}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <Link to="/admin/agencies" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-teal"><Building2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalAgencies ?? "—"}</div>
            <div className="tvp-kpi-label">Total Agencies</div>
            <div
              className="tvp-kpi-sub"
              style={{ color: (counts.accepted ?? 0) > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}
            >
              {counts.accepted} accepted · {counts.incomplete + counts.invited} in progress
            </div>
          </div>
        </Link>
        <Link to="/admin/invitations" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-amber"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.invited}</div>
            <div className="tvp-kpi-label">Open Agency Invites</div>
            <div
              className="tvp-kpi-sub"
              style={{ color: counts.invited > 0 ? "var(--tvp-amber)" : "var(--tvp-green)" }}
            >
              {counts.invited > 0 ? "Awaiting acceptance" : "All caught up"}
            </div>
          </div>
        </Link>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalTalent ?? "—"}</div>
            <div className="tvp-kpi-label">Total Talent Onboarded</div>
            <div className="tvp-kpi-sub" style={{ color: "var(--tvp-muted)" }}>Excludes deleted / test records</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi" title="Aggregate count only. Admin never previews Talent Private Vault contents.">
          <div className="tvp-kpi-icon tvp-bg-blue"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalDocuments ?? "—"}</div>
            <div className="tvp-kpi-label">Total Documents Uploaded</div>
            <div className="tvp-kpi-sub" style={{ color: "var(--tvp-blue)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Lock className="h-3 w-3" /> Aggregate only · vault contents never exposed
            </div>
          </div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><Heart className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.activeShares ?? "—"}</div>
            <div className="tvp-kpi-label">Active Loved One Shares</div>
            <div
              className="tvp-kpi-sub"
              style={{ color: (metrics.data?.activeShares ?? 0) > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}
            >
              Across all Talent
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-red"><Ban className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.suspended}</div>
            <div className="tvp-kpi-label">Suspended Agencies</div>
            <div
              className="tvp-kpi-sub"
              style={{ color: counts.suspended > 0 ? "var(--tvp-red)" : "var(--tvp-green)" }}
            >
              {counts.suspended > 0 ? "Read-only / export rules apply" : "None suspended"}
            </div>
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Agency Onboarding Overview</h2>
          <Link to="/admin/agencies" className="tvp-link">View all agencies →</Link>
        </div>

        <div className="tvp-life-chips">
          {(Object.keys(counts) as string[]).map((s) => (
            <button
              key={s}
              className={`tvp-life-chip${filter === s ? " tvp-active-filter" : ""} tvp-bg-${statusTone[s]}`}
              onClick={() => setFilter(filter === s ? "all" : s)}
            >
              <div className="tvp-label">{statusLabel[s]}</div>
              <div className="tvp-num">{counts[s] ?? 0}</div>
            </button>
          ))}
        </div>
        <div className="tvp-small" style={{ margin: "-4px 0 14px 2px" }}>
          {filter === "all" ? "Showing all agencies" : `Filtered by ${statusLabel[filter]}`}
        </div>

        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th><th>Status</th><th>Contact</th><th>Country</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {agencies.isLoading && (
                <tr><td colSpan={5} className="tvp-muted">Loading agencies…</td></tr>
              )}
              {!agencies.isLoading && visible.length === 0 && (
                <tr><td colSpan={5} className="tvp-muted">
                  No agencies yet. Use <Link to="/admin/invitations/new" className="tvp-link">Invite an agency</Link> to add the first one.
                </td></tr>
              )}
              {visible.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <Link to="/admin/agencies/$id" params={{ id: r.id }} className="text-ink">
                      <strong>{r.name}</strong>
                    </Link>
                  </td>
                  <td>
                    <span className={`tvp-status tvp-${statusTone[r.status]}`}>
                      {statusLabel[r.status]}
                    </span>
                  </td>
                  <td>{r.contact_person ?? r.contact_email ?? "—"}</td>
                  <td>{r.country ?? "—"}</td>
                  <td>{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
