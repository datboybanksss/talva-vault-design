import { SHARE_TERM, SHARE_RECIPIENT_TERM_PLURAL_CAPITALISED } from "@/lib/terms";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import {
  useTalentInvitationActions,
  TALENT_INVITE_STATUS_LABEL,
  TALENT_INVITE_STATUS_TONE,
} from "@/components/admin/talent-invitation-actions";
import { listIndependentTalentInvitations } from "@/lib/independent-talent.functions";
import { usePagedList } from "@/lib/pagination";
import { LoadMoreRow } from "@/components/shared/load-more";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Mail,
  CheckCircle2,
  FileText,
  Share2,
  Link2,
  Send,
  UserPlus,
  Ban,
  RefreshCw,
} from "lucide-react";
import {
  getDashboardMetrics,
  listAgencies,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Platform overview · TalVault Admin" },
      { name: "description", content: "Agencies, talent, invitations and sharing across TalVault at a glance." },
    ],
  }),
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

  const listTalentInvitesFn = useServerFn(listIndependentTalentInvitations);
  const talentInvites = useQuery({
    queryKey: ["admin", "talent-invitations"],
    queryFn: () => listTalentInvitesFn(),
  });
  const talentActions = useTalentInvitationActions();
  const talentPage = usePagedList<any>(talentInvites.data ?? [], { resetKey: "talent" });

  const [filter, setFilter] = useState<string>("all");
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  const visible = useMemo(() => {
    const list = agencies.data ?? [];
    return filter === "all" ? list : list.filter((a: any) => a.status === filter);
  }, [agencies.data, filter]);

  // Rule of 10: the overview table caps at a batch with "Load more".
  const agencyPage = usePagedList<any>(visible, { resetKey: filter });

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
    talentInvites.refetch();
    setRefreshedAt(new Date());
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Platform overview</h1>
          <div className="tvp-subtitle">
            A consolidated reporting view across agencies, talent, documents and invitation activity.
          </div>
        </div>
        <div className="tvp-actions">
          <span className="tvp-small">Metrics refreshed {freshnessLabel}</span>
          <button className="tvp-secondary" onClick={refreshMetrics}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link to="/admin/invitations/new" className="tvp-secondary">
            <Send className="h-4 w-4" />Invite an agency
          </Link>
          <Link to="/admin/invitations/talent/new" className="tvp-primary">
            <UserPlus className="h-4 w-4" />Invite talent
          </Link>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <Link to="/admin/agencies" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-teal"><Building2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalAgencies ?? "—"}</div>
            <div className="tvp-kpi-label">Total Agencies</div>
            <div className={`tvp-kpi-sub${(counts.accepted ?? 0) > 0 ? "" : " tvp-neutral"}`}>
              {counts.accepted} accepted · {counts.incomplete + counts.invited} in progress
            </div>
          </div>
        </Link>
        <Link to="/admin/invitations" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-amber"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.invited + (metrics.data?.openTalentInvites ?? 0)}</div>
            <div className="tvp-kpi-label">Open invitations</div>
            <div className="tvp-kpi-sub">
              {counts.invited} {counts.invited === 1 ? "agency" : "agencies"} · {metrics.data?.openTalentInvites ?? 0} talent
            </div>
          </div>
        </Link>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalTalent ?? "—"}</div>
            <div className="tvp-kpi-label">Talent onboarded</div>
            <div className="tvp-kpi-sub tvp-neutral">
              {metrics.data?.agencyLinkedTalent ?? 0} agency-linked · {metrics.data?.independentTalent ?? 0} independent
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-amber"><Link2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.pendingLinkRequests ?? "—"}</div>
            <div className="tvp-kpi-label">Pending link requests</div>
            <div className="tvp-kpi-sub tvp-neutral">Agencies waiting on existing talent</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalDocuments ?? "—"}</div>
            <div className="tvp-kpi-label">Total Documents Uploaded</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><Share2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.activeShares ?? "—"}</div>
            <div className="tvp-kpi-label">Active {SHARE_TERM} shares</div>
            <div className={`tvp-kpi-sub${(metrics.data?.activeShares ?? 0) > 0 ? "" : " tvp-neutral"}`}>
              {SHARE_RECIPIENT_TERM_PLURAL_CAPITALISED} across all talent
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-red"><Ban className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.suspended}</div>
            <div className="tvp-kpi-label">Suspended Agencies</div>
            <div className={`tvp-kpi-sub${counts.suspended > 0 ? " tvp-danger" : ""}`}>
              {counts.suspended > 0 ? "Read-only / export rules apply" : "None suspended"}
            </div>
          </div>
        </div>
      </div>


      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Agency invitations</h2>
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
                  No agencies on the platform yet.{" "}
                  <Link to="/admin/invitations/new" className="tvp-link">Invite an agency</Link>
                  {" · "}
                  <Link to="/admin/invitations/talent/new" className="tvp-link">Invite talent</Link>
                </td></tr>
              )}
              {agencyPage.visible.map((r: any) => (
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
              <LoadMoreRow
                colSpan={5}
                noun="agencies"
                shown={agencyPage.shown}
                total={agencyPage.total}
                hasMore={agencyPage.hasMore}
                onLoadMore={agencyPage.loadMore}
              />
            </tbody>
          </table>
        </div>
      </div>
      <div className="tvp-card tvp-panel" style={{ marginTop: 16 }} data-tour="admin-talent-invitations">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Talent invitations</h2>
          <Link to="/admin/invitations" className="tvp-link">View all invitations →</Link>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Talent name</th><th>Email</th><th>Status</th><th>Sent</th><th>Expires</th><th>Documents</th><th></th>
              </tr>
            </thead>
            <tbody>
              {talentInvites.isLoading && (
                <tr><td colSpan={7} className="tvp-muted">Loading talent invitations…</td></tr>
              )}
              {!talentInvites.isLoading && (talentInvites.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="tvp-muted">
                  No talent invitations yet.{" "}
                  <Link to="/admin/invitations/new" className="tvp-link">Invite an agency</Link>
                  {" · "}
                  <Link to="/admin/invitations/talent/new" className="tvp-link">Invite talent</Link>
                </td></tr>
              )}
              {talentPage.visible.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <Link to="/admin/invitations/talent/$id" params={{ id: r.id }} className="text-ink">
                      <strong>{r.talent_name}</strong>
                    </Link>
                  </td>
                  <td>{r.email}</td>
                  <td>
                    <span className={`tvp-status tvp-${TALENT_INVITE_STATUS_TONE[r.status] ?? "neutral"}`}>
                      {TALENT_INVITE_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>{r.last_sent_at ? fmt(r.last_sent_at) : "—"}</td>
                  <td>{r.status === "pending" || r.status === "expired" ? fmt(r.expires_at) : "—"}</td>
                  <td>{r.doc_count}/2</td>
                  <td><RowActionsMenu actions={talentActions(r)} /></td>
                </tr>
              ))}
              <LoadMoreRow
                colSpan={7}
                noun="talent invitations"
                shown={talentPage.shown}
                total={talentPage.total}
                hasMore={talentPage.hasMore}
                onLoadMore={talentPage.loadMore}
              />
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
