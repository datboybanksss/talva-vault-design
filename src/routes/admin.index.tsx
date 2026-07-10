import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Building2,
  Mail,
  CheckCircle2,
  FileText,
  Folder,
  Lock,
  Heart,
  Ban,
  Info,
  MoreVertical,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Platform Overview · TalVault Admin" }],
  }),
  component: AdminDashboard,
});

type Status = "Incomplete" | "Invited" | "Accepted" | "Expired" | "Declined" | "Suspended";

const statusToTone: Record<Status, string> = {
  Incomplete: "purple",
  Invited: "blue",
  Accepted: "green",
  Expired: "amber",
  Declined: "red",
  Suspended: "teal",
};

const rows: {
  agency: string; reg: string; status: Status; since: string;
  next: string; owner: string; type: string;
}[] = [
  { agency: "Mbeki Sports Management", reg: "Reg. 2026/045678/07", status: "Accepted", since: "12 May 2026", next: "View agency", owner: "Thandi Ndlovu", type: "Sports Agency" },
  { agency: "StarBurst Talent Agency", reg: "Reg. 2026/036789/08", status: "Invited", since: "28 May 2026", next: "Await agency response", owner: "Lara Prasad", type: "Talent Agency" },
  { agency: "Elite Performers SA", reg: "Reg. 2026/051234/08", status: "Incomplete", since: "25 May 2026", next: "Complete and send invite", owner: "Israel Noko", type: "Sports Agency" },
  { agency: "Next Gen Artists", reg: "Reg. 2026/061789/07", status: "Incomplete", since: "3 Jun 2026", next: "Complete onboarding details", owner: "Aviwe Okafor", type: "Arts Agency" },
  { agency: "Summit Entertainment", reg: "Reg. 2026/047111/07", status: "Suspended", since: "2 days ago", next: "Review suspension", owner: "Thandi Ndlovu", type: "Mixed Agency" },
  { agency: "Canvas Artists Co", reg: "Reg. 2026/044502/07", status: "Expired", since: "1 Jun 2026", next: "Reissue invite", owner: "Israel Noko", type: "Arts Agency" },
  { agency: "BlueLine Models", reg: "Reg. 2026/049320/08", status: "Declined", since: "29 May 2026", next: "Contact agency", owner: "Lara Prasad", type: "Talent Agency" },
];

function AdminDashboard() {
  const [filter, setFilter] = useState<Status | "all">("all");

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [filter],
  );

  const counts = useMemo(() => {
    const c: Record<Status, number> = { Incomplete: 7, Invited: 5, Accepted: 28, Expired: 2, Declined: 1, Suspended: 2 };
    return c;
  }, []);

  const [refreshedAt, setRefreshedAt] = useState<Date>(() => new Date());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const freshnessLabel = useMemo(() => {
    const diffSec = Math.max(0, Math.round((nowTick - refreshedAt.getTime()) / 1000));
    if (diffSec < 60) return "just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }, [nowTick, refreshedAt]);

  const refreshMetrics = () => {
    setRefreshedAt(new Date());
    setNowTick(Date.now());
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
            Metrics refreshed {freshnessLabel} · BR-REP-006
          </span>
          <button className="tvp-secondary" onClick={refreshMetrics}>
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>
      </div>

      <div className="tvp-reporting-note">
        <div className="tvp-note-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>Admin reporting rule (BR-REP-001…005):</strong> aggregate platform-level counts and
          operational metadata only. Private Vault totals are shown as counts — Admin cannot open or
          preview Talent Private Vault contents from this dashboard (BR-REP-004 / BR-PERM-002).
          Agency Shared Folder content access requires explicit support / legal permission (BR-REP-005 / BR-PERM-003).
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <Link to="/admin/agencies" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-teal"><Building2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">45</div>
            <div className="tvp-kpi-label">Total Agencies</div>
            <div className="tvp-kpi-sub">28 accepted · 17 in progress</div>
          </div>
        </Link>
        <Link to="/admin/invitations" className="tvp-card tvp-kpi tvp-clickable">
          <div className="tvp-kpi-icon tvp-bg-amber"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">14</div>
            <div className="tvp-kpi-label">Open Agency Invites</div>
            <div className="tvp-kpi-sub tvp-warn">2 expiring soon</div>
          </div>
        </Link>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">124</div>
            <div className="tvp-kpi-label">Total Talent Onboarded</div>
            <div className="tvp-kpi-sub">Across all agencies</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">1,284</div>
            <div className="tvp-kpi-label">Total Documents Uploaded</div>
            <div className="tvp-kpi-sub tvp-info">Agency + Talent aggregate</div>
          </div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue"><Folder className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">742</div>
            <div className="tvp-kpi-label">Agency Shared Folder Docs</div>
            <div className="tvp-kpi-sub tvp-info">Metadata / reporting count</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><Lock className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">542</div>
            <div className="tvp-kpi-label">Talent Private Vault Docs</div>
            <div className="tvp-kpi-sub tvp-warn">Aggregate only · no content access</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><Heart className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">36</div>
            <div className="tvp-kpi-label">Active Loved One Shares</div>
            <div className="tvp-kpi-sub">Across all Talent</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-red"><Ban className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">2</div>
            <div className="tvp-kpi-label">Suspended Agencies</div>
            <div className="tvp-kpi-sub tvp-warn">Read-only / export rules apply</div>
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Agency Onboarding Overview</h2>
          <Link to="/admin/agencies" className="tvp-link">View all agencies →</Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select className="tvp-select">
            <option>Agency Type: All</option>
            <option>Sports Agency</option>
            <option>Arts Agency</option>
            <option>Talent Agency</option>
            <option>Mixed Agency</option>
          </select>
          <select className="tvp-select">
            <option>Owner: All</option>
            <option>Thandi Ndlovu</option>
            <option>Lara Prasad</option>
            <option>Israel Noko</option>
            <option>Aviwe Okafor</option>
          </select>
          <select className="tvp-select">
            <option>Status: All</option>
            <option>Incomplete</option>
            <option>Invited</option>
            <option>Accepted</option>
            <option>Expired</option>
            <option>Declined</option>
            <option>Suspended</option>
          </select>
          <button className="tvp-link" onClick={() => setFilter("all")}>Reset filters</button>
        </div>

        <div className="tvp-life-chips">
          {(Object.keys(counts) as Status[]).map((s) => (
            <button
              key={s}
              className={`tvp-life-chip${filter === s ? " tvp-active-filter" : ""} tvp-bg-${statusToTone[s]}`}
              onClick={() => setFilter(filter === s ? "all" : s)}
            >
              <div className="tvp-label">{s}</div>
              <div className="tvp-num">{counts[s]}</div>
            </button>
          ))}
        </div>
        <div className="tvp-small" style={{ margin: "-4px 0 14px 2px" }}>
          {filter === "all" ? "Showing all agencies" : `Filtered by ${filter}`}
        </div>

        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th><th>Status</th><th>Stage Since</th>
                <th>Next Action</th><th>Owner</th><th>Type</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.agency}>
                  <td>
                    <Link
                      to="/admin/agencies/$id"
                      params={{ id: r.agency.toLowerCase().replace(/\s+/g, "-") }}
                      className="text-ink"
                    >
                      <strong>{r.agency}</strong>
                    </Link>
                    <br />
                    <span className="tvp-muted">{r.reg}</span>
                  </td>
                  <td><span className={`tvp-status tvp-${statusToTone[r.status]}`}>{r.status}</span></td>
                  <td>{r.since}</td>
                  <td>{r.next}</td>
                  <td>{r.owner}</td>
                  <td>{r.type}</td>
                  <td>
                    <button className="tvp-mini-btn"><MoreVertical className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
