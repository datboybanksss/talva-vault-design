import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentDashboard, dismissTalentReminder } from "@/lib/talent.functions";
import { Lock, FileStack, Inbox, Clock, Share2, ArrowRight, AlertCircle, Maximize2, Minimize2, X } from "lucide-react";

export const Route = createFileRoute("/talent/")({
  head: () => ({
    meta: [
      { title: "Dashboard · TalVault Talent" },
      { name: "description", content: "Your Private Vault, Agency Shared Folder and Manager requests at a glance." },
    ],
  }),
  component: TalentDashboard,
});

function TalentDashboard() {
  const load = useServerFn(getTalentDashboard);
  const dismissFn = useServerFn(dismissTalentReminder);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["talent", "dashboard"], queryFn: () => load() });
  const [showAllAttention, setShowAllAttention] = useState(false);

  const attention = data?.attention ?? [];
  const visibleAttention = showAllAttention ? attention : attention.slice(0, 3);

  const dismissNotifFn = useServerFn(dismissTalentNotification);

  const dismissItem = async (item: { key: string; snapshot: number; notificationId?: string }) => {
    if (item.notificationId) {
      await dismissNotifFn({ data: { id: item.notificationId } });
    } else {
      await dismissFn({ data: { kind: item.key, snapshot: item.snapshot } });
    }
    await queryClient.invalidateQueries({ queryKey: ["talent", "dashboard"] });
  };


  const rootMatch = useRouterState({ select: (s) => s.matches.find((m) => m.routeId === "/talent") });
  const ctx = (rootMatch?.loaderData ?? null) as
    | { profile: { full_name: string } | null; agency: { name: string } | null }
    | null;
  const firstName = (ctx?.profile?.full_name ?? "there").split(/\s+/)[0];

  const kpis = [
    { to: "/talent/vault", tone: "teal", Icon: Lock, value: data?.privateDocs ?? 0, label: "Private Docs", sub: "Only visible to you" },
    { to: "/talent/vault", tone: "blue", Icon: FileStack, value: data?.sharedDocs ?? 0, label: "Agency Shared", sub: "Visible to your Manager" },
    { to: "/talent/vault", tone: "amber", Icon: Clock, value: data?.expiringSoon ?? 0, label: "Expiring soon", sub: "Shared items due for renewal" },
    { to: "/talent/vault", search: { tab: "agency", view: "requests" }, tone: "purple", Icon: Inbox, value: (data?.openRequests ?? 0) + (data?.resubRequests ?? 0), label: "Manager Requests", sub: `${data?.resubRequests ?? 0} need resubmission` },
  ];

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Welcome back, {firstName} 👋</h1>
          <div className="tvp-subtitle">
            {data?.hasLink
              ? `Linked to ${ctx?.agency?.name ?? "your Manager"}. Your vault is calm, secure and separated into private and shared areas.`
              : "Your Private Vault is ready. Once a Manager links you, your Agency Shared Folder appears here."}
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel" style={{ marginBottom: 22 }}>
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Needs attention</h2>
          {attention.length > 3 && (
            <button
              type="button"
              className="tvp-link"
              onClick={() => setShowAllAttention((v) => !v)}
              title={showAllAttention ? "Show fewer" : "Show all"}
            >
              {showAllAttention ? (
                <><Minimize2 className="h-3.5 w-3.5" /> Show less</>
              ) : (
                <><Maximize2 className="h-3.5 w-3.5" /> Show all ({attention.length})</>
              )}
            </button>
          )}
        </div>

        {attention.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 10 }}>
            Nothing needs your attention right now — you're fully up to date.
          </p>
        ) : (
          <div className="tvp-review-list">
            {visibleAttention.map((item) => (
              <div key={item.key} className="tvp-review-row">
                <Link
                  to="/talent/vault"
                  search={
                    item.type === "request"
                      ? { tab: "agency", view: "requests" }
                      : { tab: "agency", view: "folder" }
                  }
                  className="tvp-review-link"
                  style={{ display: "contents", color: "inherit", textDecoration: "none" }}
                >
                  <span className={`tvp-review-icon tvp-bg-${item.tone}`}>
                    {item.type === "request" ? (
                      item.tone === "amber" ? <AlertCircle className="h-3.5 w-3.5" /> : <Inbox className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tvp-review-name">{item.title}</div>
                    <div className="tvp-review-meta">{item.detail}</div>
                  </div>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  className="tvp-icon-btn"
                  title="Dismiss from this feed"
                  aria-label="Dismiss from this feed"
                  onClick={() => dismissItem(item)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>


      <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", marginBottom: 22 }}>

        {kpis.map((k) => (
          <Link key={k.label} to={k.to} search={(k as any).search} className="tvp-card tvp-kpi tvp-clickable">
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




      <div className="tvp-card tvp-panel" style={{ marginBottom: 22 }}>
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Vault overview</h2>
          <Link to="/talent/vault" className="tvp-link">Open Vault →</Link>
        </div>
        <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", marginTop: 14 }}>
          <Link to="/talent/vault" search={{ tab: "private" }} className="tvp-doc-card tvp-clickable" style={{ alignItems: "flex-start" }}>
            <div className="tvp-kpi-icon tvp-bg-teal" style={{ width: 40, height: 40 }}><Lock className="h-4 w-4" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Private Vault</strong>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                Personal documents. Not visible to the Agency.
              </div>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {data?.privateFolders ?? 0} folder{(data?.privateFolders ?? 0) === 1 ? "" : "s"} · {data?.privateDocs ?? 0} document{(data?.privateDocs ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
            <span className="tvp-status tvp-green">Private</span>
          </Link>

          <Link to="/talent/vault" search={{ tab: "agency" }} className="tvp-doc-card tvp-clickable" style={{ alignItems: "flex-start" }}>
            <div className="tvp-kpi-icon tvp-bg-blue" style={{ width: 40, height: 40 }}><FileStack className="h-4 w-4" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Agency Shared Folder</strong>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                Documents deliberately shared with your Agency.
              </div>
              <div className="tvp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {data?.sharedFolders ?? 0} folder{(data?.sharedFolders ?? 0) === 1 ? "" : "s"} · {data?.sharedDocs ?? 0} document{(data?.sharedDocs ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
            <span className="tvp-status tvp-blue">Shared</span>
          </Link>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: "1 1 320px" }}>
            <div className="tvp-kpi-icon tvp-bg-purple" style={{ width: 40, height: 40, flexShrink: 0 }}>
              <Share2 className="h-4 w-4" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="tvp-h2">Sharing</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
                Share documents securely with a Loved One via a magic link.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 26, flexShrink: 0 }}>
            <div>
              <div className="tvp-kpi-value">{data?.activeShares ?? 0}</div>
              <div className="tvp-kpi-label">Active shares</div>
            </div>
            <Link to="/talent/sharing">
              <button className="tvp-secondary">
                <Share2 className="h-4 w-4" /> Manage sharing
              </button>
            </Link>
          </div>
        </div>
      </div>

    </>
  );
}
