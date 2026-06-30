import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/agencies/$id")({
  head: () => ({ meta: [{ title: "Agency · TalVault Admin" }] }),
  component: AgencyDetail,
});

const TABS = ["overview", "activation", "client-invites", "support-activity"] as const;
type Tab = (typeof TABS)[number];

function AgencyDetail() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const name = id
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <div className="tvp-breadcrumb">
            <Link to="/admin/agencies" className="tvp-ghost">
              <ChevronLeft className="h-4 w-4" />Agencies
            </Link>
            <span>›</span>
            <span>{name}</span>
          </div>
          <h1 className="tvp-h1">
            {name} <span className="tvp-status tvp-green">Accepted</span>
          </h1>
          <div className="tvp-subtitle">Agency profile, onboarding state and support view.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary">Actions ▾</button>
        </div>
      </div>

      <div className="tvp-card tvp-agency-hero">
        <div className="tvp-logo-box">{name.split(" ").map((w) => w[0]).slice(0, 3).join("")}</div>
        <div>
          <h2 className="tvp-h2">{name}</h2>
          <p className="tvp-muted">Sport agency · Reg. 2026/045678/07</p>
          <div className="tvp-meta-grid">
            <div><div className="tvp-meta-label">Main Contact</div><div className="tvp-meta-value">Thandi Ndlovu</div></div>
            <div><div className="tvp-meta-label">Status</div><div className="tvp-meta-value">Accepted</div></div>
            <div><div className="tvp-meta-label">Talent</div><div className="tvp-meta-value">24</div></div>
            <div><div className="tvp-meta-label">Last Updated</div><div className="tvp-meta-value">14 May 2026</div></div>
          </div>
        </div>
        <button className="tvp-primary"><Plus className="h-4 w-4" />Add Support Note</button>
      </div>

      <div className="tvp-card" style={{ marginTop: 20 }}>
        <div className="tvp-subnav">
          {TABS.map((t) => (
            <button
              key={t}
              className={tab === t ? "tvp-active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "overview" && "Overview"}
              {t === "activation" && "Activation"}
              {t === "client-invites" && "Agency Client Invites"}
              {t === "support-activity" && "Support Activity"}
            </button>
          ))}
        </div>
        <div className="tvp-panel">
          {tab === "overview" && (
            <div className="tvp-inline-grid-3">
              <div className="tvp-card tvp-panel">
                <h3 className="tvp-h3">Next Action</h3>
                <p className="tvp-muted" style={{ fontSize: 13, margin: "8px 0 14px" }}>
                  Monitor agency activity and complete workspace setup.
                </p>
                <button className="tvp-primary">Go to Agency</button>
              </div>
              <div className="tvp-card tvp-panel">
                <h3 className="tvp-h3">Document Review</h3>
                <p className="tvp-muted" style={{ fontSize: 13, margin: "8px 0 14px" }}>
                  2 documents require Admin review.
                </p>
                <button className="tvp-secondary">Complete onboarding</button>
              </div>
              <div className="tvp-card tvp-panel">
                <h3 className="tvp-h3">Open Support Items</h3>
                <p className="tvp-muted" style={{ fontSize: 13, margin: "8px 0 14px" }}>
                  1 invite issue requires follow-up.
                </p>
                <button className="tvp-secondary">View support log</button>
              </div>
            </div>
          )}

          {tab === "activation" && (
            <>
              <h2 className="tvp-h2">Lifecycle Progress</h2>
              <div className="tvp-life-chips" style={{ marginTop: 16, gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
                <div className="tvp-life-chip tvp-bg-purple"><div className="tvp-label">Created</div><div className="tvp-num">✓</div></div>
                <div className="tvp-life-chip tvp-bg-teal"><div className="tvp-label">Reviewed</div><div className="tvp-num">✓</div></div>
                <div className="tvp-life-chip tvp-bg-blue"><div className="tvp-label">Invited</div><div className="tvp-num">✓</div></div>
                <div className="tvp-life-chip tvp-bg-green"><div className="tvp-label">Activated</div><div className="tvp-num">✓</div></div>
                <div className="tvp-life-chip tvp-bg-green"><div className="tvp-label">Accepted</div><div className="tvp-num">✓</div></div>
              </div>
            </>
          )}

          {tab === "client-invites" && (
            <>
              <div className="tvp-panel-head">
                <div>
                  <h2 className="tvp-h2">Agency Invitations</h2>
                  <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
                    Invitations sent by this agency to Agency users and Talent.
                  </p>
                </div>
                <button className="tvp-secondary">Export Invites</button>
              </div>
              <h3 className="tvp-h3" style={{ margin: "16px 0 8px" }}>Agency Users Invited</h3>
              <table className="tvp-table">
                <thead><tr><th>Recipient</th><th>Email</th><th>Status</th><th>Sent</th><th>Expires</th></tr></thead>
                <tbody>
                  <tr><td><strong>Lara Prasad</strong></td><td>lara@premiermodels.co.za</td><td><span className="tvp-status tvp-blue">Invited</span></td><td>3 Jun</td><td><span className="tvp-status tvp-amber">2 days</span></td></tr>
                  <tr><td><strong>Thandi Mokoena</strong></td><td>thandi@premiermodels.co.za</td><td><span className="tvp-status tvp-red">Expired</span></td><td>20 May</td><td><span className="tvp-status tvp-red">Expired</span></td></tr>
                </tbody>
              </table>
              <h3 className="tvp-h3" style={{ margin: "18px 0 8px" }}>Talent Invited by Agency</h3>
              <table className="tvp-table">
                <thead><tr><th>Talent</th><th>Email</th><th>Status</th><th>Sent</th></tr></thead>
                <tbody>
                  <tr><td><strong>Israel Noko</strong></td><td>israel@premiermodels.co.za</td><td><span className="tvp-status tvp-green">Accepted</span></td><td>28 May</td></tr>
                  <tr><td><strong>Aisha Patel</strong></td><td>aisha.patel@example.com</td><td><span className="tvp-status tvp-blue">Invited</span></td><td>1 Jun</td></tr>
                </tbody>
              </table>
              <div className="tvp-help-note">
                ✓ <strong>Support rule:</strong> Admin can update invite email before acceptance, resend, copy active invite links, and revoke users. All actions audit-logged.
              </div>
            </>
          )}

          {tab === "support-activity" && (
            <>
              <h2 className="tvp-h2">Support Activity</h2>
              <table className="tvp-table" style={{ marginTop: 16 }}>
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Result</th></tr></thead>
                <tbody>
                  <tr><td>Today, 11:58</td><td>Lara Prasad</td><td>Updated invite email</td><td><span className="tvp-status tvp-green">Logged</span></td></tr>
                  <tr><td>Today, 10:12</td><td>Israel Noko</td><td>Copied invite link</td><td><span className="tvp-status tvp-green">Logged</span></td></tr>
                  <tr><td>Yesterday</td><td>System</td><td>Invitation reminder sent</td><td><span className="tvp-status tvp-green">Logged</span></td></tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </>
  );
}
