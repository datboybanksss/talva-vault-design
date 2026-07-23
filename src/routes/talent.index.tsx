import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, FileStack, Sparkles, Clock, Share2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/talent/")({
  head: () => ({ meta: [{ title: "Dashboard · TalVault Talent" }] }),
  component: TalentDashboard,
});

const kpis = [
  { to: "/talent/vault", tone: "teal", Icon: Lock, value: 18, label: "Private Docs", sub: "Only visible to you" },
  { to: "/talent/vault", tone: "blue", Icon: FileStack, value: 9, label: "Agency Shared", sub: "Visible to Agency", subTone: "tvp-info" },
  { to: "/talent/vault", tone: "purple", Icon: Sparkles, value: 4, label: "Review Items", sub: "Needs confirmation", subTone: "tvp-warn" },
];

function TalentDashboard() {
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Welcome back, Caster 👋</h1>
          <div className="tvp-subtitle">
            Your vault is calm, secure and separated into private and agency-shared areas.
          </div>
        </div>
      </div>

      <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 22 }}>
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="tvp-card tvp-kpi tvp-clickable">
            <div className={`tvp-kpi-icon tvp-bg-${k.tone}`}>
              <k.Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="tvp-kpi-value">{k.value}</div>
              <div className="tvp-kpi-label">{k.label}</div>
              <div className={`tvp-kpi-sub ${k.subTone ?? ""}`}>{k.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="tvp-two-col">
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <h2 className="tvp-h2">Vault overview</h2>
            <Link to="/talent/vault" className="tvp-link">Open Vault →</Link>
          </div>
          <div className="tvp-doc-grid">
            <Link to="/talent/vault" className="tvp-doc-card">
              <div className="tvp-kpi-icon tvp-bg-teal" style={{ width: 42, height: 42 }}><Lock className="h-4 w-4" /></div>
              <div>
                <strong>Private Vault</strong>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Personal documents. Not visible to the Agency.</div>
              </div>
              <span className="tvp-status tvp-teal">Private</span>
            </Link>
            <Link to="/talent/vault" className="tvp-doc-card">
              <div className="tvp-kpi-icon tvp-bg-blue" style={{ width: 42, height: 42 }}><FileStack className="h-4 w-4" /></div>
              <div>
                <strong>Agency Shared Folder</strong>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Documents deliberately shared with your Agency.</div>
              </div>
              <span className="tvp-status tvp-blue">Shared</span>
            </Link>
          </div>
          <div className="tvp-callout" style={{ background: "#FBF5FF", borderColor: "#E0CFFB" }}>
            <div className="tvp-callout-icon" style={{ background: "var(--tvp-purple-bg)", color: "var(--tvp-purple)" }}>
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <strong>AI filing rule:</strong>{" "}
              <span className="tvp-muted">
                TalVault can suggest folder, subfolder and expiry/reminder dates, but the Talent must validate before the document is stored or a reminder is created.
              </span>
            </div>
          </div>
        </div>

        <div className="tvp-stack">
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">What needs attention</h2>
            <div className="tvp-doc-card" style={{ marginTop: 14 }}>
              <div className="tvp-kpi-icon tvp-bg-purple" style={{ width: 40, height: 40 }}><Sparkles className="h-4 w-4" /></div>
              <div>
                <strong>Passport needs AI confirmation</strong>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Confirm folder and reminder date.</div>
              </div>
              <Link to="/talent/vault" className="tvp-mini-btn"><ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="tvp-doc-card" style={{ marginTop: 10 }}>
              <div className="tvp-kpi-icon tvp-bg-amber" style={{ width: 40, height: 40 }}><Clock className="h-4 w-4" /></div>
              <div>
                <strong>Contract expiring soon</strong>
                <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Reminder date approaching.</div>
              </div>
              <Link to="/talent/vault" className="tvp-mini-btn"><ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>

          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Sharing status</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
              3 active Loved One access links. 1 expires in 3 days.
            </p>
            <Link to="/talent/sharing">
              <button className="tvp-secondary" style={{ marginTop: 12 }}>
                <Share2 className="h-4 w-4" /> Manage shared access
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
