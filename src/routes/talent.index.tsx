import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentDashboard } from "@/lib/talent.functions";
import { Lock, FileStack, Inbox, Clock, Share2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/talent/")({
  head: () => ({
    meta: [
      { title: "Dashboard · TalVault Talent" },
      { name: "description", content: "Your Private Vault, Roster Shared Folder and Manager requests at a glance." },
    ],
  }),
  component: TalentDashboard,
});

function TalentDashboard() {
  const load = useServerFn(getTalentDashboard);
  const { data } = useQuery({ queryKey: ["talent", "dashboard"], queryFn: () => load() });

  const rootMatch = useRouterState({ select: (s) => s.matches.find((m) => m.routeId === "/talent") });
  const ctx = (rootMatch?.loaderData ?? null) as
    | { profile: { full_name: string } | null; agency: { name: string } | null }
    | null;
  const firstName = (ctx?.profile?.full_name ?? "there").split(/\s+/)[0];

  const kpis = [
    { to: "/talent/vault", tone: "teal", Icon: Lock, value: data?.privateDocs ?? 0, label: "Private Docs", sub: "Only visible to you" },
    { to: "/talent/vault", tone: "blue", Icon: FileStack, value: data?.sharedDocs ?? 0, label: "Roster Shared", sub: "Visible to your Manager" },
    { to: "/talent/vault", tone: "amber", Icon: Clock, value: data?.expiringSoon ?? 0, label: "Expiring 30d", sub: "Shared items due for renewal" },
    { to: "/talent/vault", tone: "purple", Icon: Inbox, value: (data?.openRequests ?? 0) + (data?.resubRequests ?? 0), label: "Manager Requests", sub: `${data?.resubRequests ?? 0} need resubmission` },
  ];

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Welcome back, {firstName} 👋</h1>
          <div className="tvp-subtitle">
            {data?.hasLink
              ? `Linked to ${ctx?.agency?.name ?? "your Manager"}. Your vault is calm, secure and separated into private and shared areas.`
              : "Your Private Vault is ready. Once a Manager links you to their roster, your Shared Folder appears here."}
          </div>
        </div>
      </div>

      <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", marginBottom: 22 }}>
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="tvp-card tvp-kpi tvp-clickable">
            <div className={`tvp-kpi-icon tvp-bg-${k.tone}`}>
              <k.Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="tvp-kpi-value">{k.value}</div>
              <div className="tvp-kpi-label">{k.label}</div>
              <div className="tvp-kpi-sub">{k.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="tvp-two-col">
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <h2 className="tvp-h2">Recent shared activity</h2>
            <Link to="/talent/vault" className="tvp-link">Open Vault →</Link>
          </div>
          {(!data?.recent || data.recent.length === 0) ? (
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 8 }}>Nothing shared yet.</p>
          ) : (
            <div className="tvp-doc-grid" style={{ marginTop: 10 }}>
              {data.recent.map((d: any) => (
                <div key={d.id} className="tvp-doc-card">
                  <div className="tvp-kpi-icon tvp-bg-blue" style={{ width: 38, height: 38 }}>
                    {d.status === "filed" ? <CheckCircle2 className="h-4 w-4" /> : <FileStack className="h-4 w-4" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{d.name}</strong>
                    <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {d.folder} · updated {new Date(d.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`tvp-status tvp-${d.status === "filed" ? "green" : "amber"}`}>
                    {d.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tvp-stack">
          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">What needs attention</h2>
            {(data?.resubRequests ?? 0) > 0 && (
              <Link to="/talent/vault" className="tvp-doc-card" style={{ marginTop: 14 }}>
                <div className="tvp-kpi-icon tvp-bg-amber" style={{ width: 40, height: 40 }}><AlertCircle className="h-4 w-4" /></div>
                <div>
                  <strong>{data?.resubRequests} resubmission{data?.resubRequests === 1 ? "" : "s"} requested</strong>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Your Manager needs an updated file.</div>
                </div>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {(data?.openRequests ?? 0) > 0 && (
              <Link to="/talent/vault" className="tvp-doc-card" style={{ marginTop: 10 }}>
                <div className="tvp-kpi-icon tvp-bg-purple" style={{ width: 40, height: 40 }}><Inbox className="h-4 w-4" /></div>
                <div>
                  <strong>{data?.openRequests} pending request{data?.openRequests === 1 ? "" : "s"}</strong>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Open Vault → Manager Requests.</div>
                </div>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {(data?.expiringSoon ?? 0) > 0 && (
              <Link to="/talent/vault" className="tvp-doc-card" style={{ marginTop: 10 }}>
                <div className="tvp-kpi-icon tvp-bg-amber" style={{ width: 40, height: 40 }}><Clock className="h-4 w-4" /></div>
                <div>
                  <strong>{data?.expiringSoon} shared document{data?.expiringSoon === 1 ? "" : "s"} expiring</strong>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>Within the next 30 days.</div>
                </div>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {(data?.resubRequests ?? 0) === 0 && (data?.openRequests ?? 0) === 0 && (data?.expiringSoon ?? 0) === 0 && (
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 10 }}>You're all caught up.</p>
            )}
          </div>

          <div className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Sharing</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
              Share documents securely with a Loved One via a magic link.
            </p>
            <Link to="/talent/sharing">
              <button className="tvp-secondary" style={{ marginTop: 12 }}>
                <Share2 className="h-4 w-4" /> Manage Loved-One access
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
