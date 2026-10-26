import { searchParam } from "@/lib/search";
import { normaliseAccountScope } from "@/lib/account-filters";
import { SHARE_TERM } from "@/lib/terms";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Mail,
  CheckCircle2,
  FileText,
  Share2,
  Link2,
  Send,
  Ban,
  RefreshCw,
} from "lucide-react";
import { getDashboardMetrics } from "@/lib/admin.functions";
import { CombinedInvitationsList } from "@/components/admin/combined-invitations-list";
import { normaliseInvitationStatus, normaliseInvitationType } from "@/lib/invitation-filters";

export const Route = createFileRoute("/admin/")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { itype?: string; istatus?: string; iaccounts?: string; iq?: string } => ({
    ...(normaliseInvitationType(raw.itype) !== "all" ? { itype: String(raw.itype) } : {}),
    ...(normaliseInvitationStatus(raw.istatus) !== "all" ? { istatus: String(raw.istatus) } : {}),
    ...(normaliseAccountScope(raw.iaccounts, "all") !== "all"
      ? { iaccounts: String(raw.iaccounts) }
      : {}),
    ...(searchParam(raw.iq) ? { iq: searchParam(raw.iq) } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Platform overview · TalVault Admin" },
      {
        name: "description",
        content: "Agencies, talent, invitations and sharing across TalVault at a glance.",
      },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const getMetricsFn = useServerFn(getDashboardMetrics);
  const qc = useQueryClient();

  const metrics = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => getMetricsFn(),
    refetchInterval: 60_000,
  });
  const search = Route.useSearch();
  const itype = normaliseInvitationType(search.itype);
  const istatus = normaliseInvitationStatus(search.istatus);
  const nav = useNavigate({ from: "/admin/" });
  const iaccounts = normaliseAccountScope(search.iaccounts, "all");
  const setFilters = (next: {
    itype?: string;
    istatus?: string;
    iaccounts?: string;
    iq?: string;
  }) =>
    nav({
      search: (prev: any) => {
        const merged = { ...prev, ...next };
        const out: Record<string, string> = {};
        if (merged.itype && merged.itype !== "all") out.itype = merged.itype;
        if (merged.istatus && merged.istatus !== "all") out.istatus = merged.istatus;
        if (merged.iaccounts && merged.iaccounts !== "all") out.iaccounts = merged.iaccounts;
        {
          const iq = searchParam(merged.iq);
          if (iq) out.iq = iq;
        }
        return out as any;
      },
      replace: true,
    });
  const clearFilters = () => nav({ search: {} as any, replace: true });

  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  const counts = metrics.data?.statusCounts ?? {
    incomplete: 0,
    invited: 0,
    accepted: 0,
    expired: 0,
    declined: 0,
    suspended: 0,
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
    qc.invalidateQueries({ queryKey: ["admin", "combined-invitations"] });
    setRefreshedAt(new Date());
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Platform overview</h1>
          <div className="tvp-subtitle">
            A consolidated reporting view across agencies, talent, documents and invitation
            activity.
          </div>
        </div>
        <div className="tvp-actions">
          <span className="tvp-small">Metrics refreshed {freshnessLabel}</span>
          <button className="tvp-secondary" onClick={refreshMetrics}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            to="/admin/invitations/new"
            className="tvp-primary"
            data-tour="admin-new-invitation"
          >
            <Send className="h-4 w-4" />
            New invitation
          </Link>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <Link
          to="/admin/accounts"
          search={{ type: "agency" }}
          className="tvp-card tvp-kpi tvp-clickable"
        >
          <div className="tvp-kpi-icon tvp-bg-teal">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalAgencies ?? "—"}</div>
            <div className="tvp-kpi-label">Total Agencies</div>
            <div className={`tvp-kpi-sub${(counts.accepted ?? 0) > 0 ? "" : " tvp-neutral"}`}>
              {counts.accepted} accepted · {counts.incomplete + counts.invited} in progress
            </div>
          </div>
        </Link>
        <Link to="/admin/invitations" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-amber">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">
              {metrics.data
                ? (metrics.data.openAgencyInvites ?? 0) + (metrics.data.openTalentInvites ?? 0)
                : "—"}
            </div>
            <div className="tvp-kpi-label">Open invitations</div>
            <div className="tvp-kpi-sub">
              {metrics.data?.openAgencyInvites ?? 0}{" "}
              {metrics.data?.openAgencyInvites === 1 ? "agency" : "agencies"} ·{" "}
              {metrics.data?.openTalentInvites ?? 0} talent · {metrics.data?.draftInvites ?? 0}{" "}
              {metrics.data?.draftInvites === 1 ? "draft" : "drafts"}
            </div>
          </div>
        </Link>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalTalent ?? "—"}</div>
            <div className="tvp-kpi-label">Talent onboarded</div>
            <div className="tvp-kpi-sub tvp-neutral">
              {metrics.data?.agencyLinkedTalent ?? 0} agency-linked ·{" "}
              {metrics.data?.independentTalent ?? 0} independent
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-amber">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.pendingLinkRequests ?? "—"}</div>
            <div className="tvp-kpi-label">Pending link requests</div>
            <div className="tvp-kpi-sub tvp-neutral">Agencies waiting on existing talent</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.totalDocuments ?? "—"}</div>
            <div className="tvp-kpi-label">Total Documents Uploaded</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.activeShares ?? "—"}</div>
            <div className="tvp-kpi-label">Active {SHARE_TERM} shares</div>
            <div
              className={`tvp-kpi-sub${(metrics.data?.activeShares ?? 0) > 0 ? "" : " tvp-neutral"}`}
            >
              Shares currently open
            </div>
          </div>
        </div>
        <Link
          to="/admin/accounts"
          search={{ type: "agency", status: "suspended" }}
          className="tvp-card tvp-kpi tvp-clickable"
        >
          <div className="tvp-kpi-icon tvp-bg-red">
            <Ban className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{counts.suspended}</div>
            <div className="tvp-kpi-label">Suspended Agencies</div>
            <div className={`tvp-kpi-sub${counts.suspended > 0 ? " tvp-kpi-danger" : ""}`}>
              {counts.suspended > 0 ? "Read-only / export rules apply" : "None suspended"}
            </div>
          </div>
        </Link>
      </div>

      <CombinedInvitationsList
        tourId="admin-overview-invitations"
        type={itype}
        status={istatus}
        accounts={iaccounts}
        q={search.iq ?? ""}
        onFilterChange={(n) =>
          setFilters({ itype: n.type, istatus: n.status, iaccounts: n.accounts, iq: n.q })
        }
        onClear={clearFilters}
        viewAllSearch={{
          ...(itype !== "all" ? { type: itype } : {}),
          ...(istatus !== "all" ? { status: istatus } : {}),
          ...(iaccounts !== "all" ? { accounts: iaccounts } : {}),
          ...(search.iq ? { q: search.iq } : {}),
        }}
      />
    </>
  );
}
