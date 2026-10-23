import { SHARE_RECIPIENT_TERM, SHARE_RECIPIENT_TERM_PLURAL } from "@/lib/terms";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentDashboard } from "@/lib/talent.functions";
import { Lock, FileStack, FileText, Inbox, Clock, Share2, ChevronRight, AlertCircle, Upload, CheckCircle2, Users } from "lucide-react";
import { useTalentAgencyLinks } from "@/lib/talent-agency-links";

export const Route = createFileRoute("/talent/")({
  head: () => ({
    meta: [
      { title: "Dashboard · TalVault Talent" },
      {
        name: "description",
        content: "Your to-do list, vault summary and sharing at a glance.",
      },
      { property: "og:title", content: "Dashboard · TalVault Talent" },
      { property: "og:description", content: "Your to-do list, vault summary and sharing at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TalentDashboard,
});

const fmtDate = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type TodoItem = {
  key: string;
  type: "request" | "reminder";
  title: string;
  detail: string;
  tone: "amber" | "purple";
  targetType?: string | null;
  targetId?: string | null;
  linkId?: string;
};

function todoLink(t: TodoItem): { to: string; search?: Record<string, string> } {
  if (t.type === "request")
    return {
      to: "/talent/vault",
      search: { tab: "agency", view: "requests", ...(t.linkId ? { link: t.linkId } : {}) },
    };
  if (t.targetType === "shared_document" && t.targetId)
    return { to: "/talent/vault", search: { tab: "agency", view: "folder", doc: t.targetId } };
  if (t.targetType === "private_document" && t.targetId)
    return { to: "/talent/vault", search: { tab: "private", doc: t.targetId } };
  return { to: "/talent/notifications" };
}

function TalentDashboard() {
  const load = useServerFn(getTalentDashboard);
  const { data, isError: dashError } = useQuery({ queryKey: ["talent", "dashboard"], queryFn: () => load() });
  const agency = useTalentAgencyLinks();

  const rootMatch = useRouterState({
    select: (s) => s.matches.find((m) => m.routeId === "/talent"),
  });
  const ctx = (rootMatch?.loaderData ?? null) as { profile: { full_name: string } | null } | null;
  const firstName = (ctx?.profile?.full_name ?? "").split(/\s+/)[0] || "there";

  const rels = agency.data?.relationships ?? [];
  const active = rels.filter((r) => r.state === "active");
  const hasLink = active.length > 0;
  const agencyName = active.length === 1 ? active[0].agencyName : "your agencies";
  const todo = (data?.todo ?? []) as TodoItem[];
  const recent = data?.recentDocs ?? [];
  const contacts = data?.trustedContacts ?? [];

  let subLine = "";
  if (agency.isError) subLine = "We couldn't load your agency details. Please refresh the page.";
  else if (agency.data) {
    subLine = hasLink
      ? `Managed by ${active
          .map((r) => (active.length === 1 && r.manager?.name ? `${r.agencyName} · ${r.manager.name}` : r.agencyName))
          .join(", ")}`
      : "Independent talent";
  }

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="tvd">
      <div className="tvp-topbar tvd-top">
        <div className="tvd-title">
          <h1 className="tvp-h1">Welcome back, {firstName}</h1>
          <div className="tvp-subtitle">{subLine}</div>
        </div>
        <div className="tvd-actions">
          <Link to="/talent/vault" search={{ tab: "private" }} className="tvp-primary">
            <Upload className="h-4 w-4" /> Upload document
          </Link>
          <Link to="/talent/sharing" className="tvp-secondary">
            <Share2 className="h-4 w-4" /> Share with a {SHARE_RECIPIENT_TERM}
          </Link>
        </div>
      </div>

      {dashError && <p className="tvd-meta">Some of your dashboard couldn't be loaded. Please refresh the page.</p>}

      <div className="tvd-layout">
        <div className="tvd-main">
          <section className="tvp-card tvp-panel" data-tour="needs-attention">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">
                To do {todo.length > 0 && <span className="tvd-count-pill">{todo.length}</span>}
              </h2>
              {active.length === 1 && (data?.actionRequests ?? 0) > 0 && (
                <Link
                  to="/talent/vault"
                  search={{ tab: "agency", view: "requests", link: active[0].linkId } as any}
                  className="tvp-link"
                >
                  All requests →
                </Link>
              )}
            </div>
            {todo.length === 0 ? (
              <p className="tvd-empty">
                <CheckCircle2 className="h-4 w-4" /> You're all caught up.
              </p>
            ) : (
              <ul className="tvp-review-list tvd-list">
                {todo.map((item) => {
                  const l = todoLink(item);
                  const title =
                    item.type === "request" && hasLink && !item.title.startsWith("Resubmission")
                      ? item.title.replace(/^Requested:/, `Requested by ${agencyName}:`)
                      : item.title;
                  return (
                    <li key={item.key}>
                      <Link to={l.to} search={l.search as any} className="tvp-review-row tvd-row">
                        <span className={`tvp-review-icon tvp-bg-${item.tone}`}>
                          {item.type === "request" ? (
                            item.tone === "amber" ? (
                              <AlertCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Inbox className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <Clock className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="tvd-row-text">
                          <span className="tvp-review-name">{title}</span>
                          <span className="tvp-review-meta">{item.detail}</span>
                        </span>
                        <span />
                        <ChevronRight className="h-4 w-4 tvd-chev" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Vault</h2>
              <Link to="/talent/vault" className="tvp-link">
                Open Vault →
              </Link>
            </div>
            <div className="tvd-cards">
              <Link to="/talent/vault" search={{ tab: "private" }} className="tvp-card tvp-kpi tvp-clickable">
                <div className="tvp-kpi-icon tvp-bg-teal">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="tvp-kpi-value">{data?.privateDocs ?? 0}</div>
                  <div className="tvp-kpi-label">Private</div>
                  <div className="tvp-kpi-sub">Only you can see these</div>
                </div>
              </Link>
              {rels.map((r) => (
                <Link
                  key={r.linkId}
                  to="/talent/vault"
                  search={{ tab: "agency", link: r.linkId } as any}
                  className="tvp-card tvp-kpi tvp-clickable"
                >
                  <div className="tvp-kpi-icon tvp-bg-blue">
                    <FileStack className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="tvp-kpi-value">{r.sharedDocs}</div>
                    <div className="tvp-kpi-label">
                      {r.state === "active" ? "Shared with " : "Previously shared with "}
                      {r.agencyName}
                    </div>
                    <div className="tvp-kpi-sub">
                      {r.state === "active" ? plural(r.sharedDocs, "document") : "View only"}
                    </div>
                  </div>
                </Link>
              ))}
              {!agency.isError && agency.data && rels.length === 0 && (
                <Link to="/talent/sharing" className="tvp-card tvp-kpi tvp-clickable">
                  <div className="tvp-kpi-icon tvp-bg-purple">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="tvp-kpi-value">{data?.activeShares ?? 0}</div>
                    <div className="tvp-kpi-label">Shared with {SHARE_RECIPIENT_TERM_PLURAL}</div>
                    <div className="tvp-kpi-sub">Active secure links</div>
                  </div>
                </Link>
              )}
            </div>
            <h3 className="tvd-sub">Recent documents</h3>
            {recent.length === 0 ? (
              <p className="tvd-empty">No documents yet. Upload your first one to get started.</p>
            ) : (
              <ul className="tvp-review-list tvd-list">
                {recent.map((d) => (
                  <li key={`${d.area}:${d.id}`}>
                    <Link
                      to="/talent/vault"
                      search={
                        (d.area === "shared"
                          ? { tab: "agency", view: "folder", doc: d.id, link: (d as any).linkId }
                          : { tab: "private", doc: d.id }) as any
                      }
                      className="tvp-review-row tvd-row"
                    >
                      <span className={`tvp-review-icon ${d.area === "shared" ? "tvp-bg-blue" : "tvp-bg-teal"}`}>
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <span className="tvd-row-text">
                        <span className="tvp-review-name">{d.name}</span>
                        <span className="tvp-review-meta">
                          {d.folder} · {fmtDate(d.date)}
                        </span>
                      </span>
                      <span className={d.area === "shared" ? "tvp-status tvp-blue" : "tvp-status tvp-green"}>
                        {d.area === "shared" ? "Shared" : "Private"}
                      </span>
                      <ChevronRight className="h-4 w-4 tvd-chev" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="tvd-side">
          <section className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Sharing</h2>
              <Link to="/talent/sharing" className="tvp-link">
                Manage →
              </Link>
            </div>
            {contacts.length === 0 ? (
              <div className="tvd-share-empty">
                <p className="tvd-meta">
                  No active {SHARE_RECIPIENT_TERM_PLURAL}. Share chosen documents through a secure link that ends
                  when you decide.
                </p>
                <Link to="/talent/sharing" className="tvp-secondary">
                  <Share2 className="h-4 w-4" /> Share with a {SHARE_RECIPIENT_TERM}
                </Link>
              </div>
            ) : (
              <ul className="tvp-review-list tvd-list">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <Link to="/talent/sharing" className="tvp-review-row tvd-row">
                      <span className="tvp-review-icon tvp-bg-purple">
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      <span className="tvd-row-text">
                        <span className="tvp-review-name">{c.name}</span>
                        <span className="tvp-review-meta">
                          {c.expiresAt ? `Access ends ${fmtDate(c.expiresAt)}` : "No end date"}
                        </span>
                      </span>
                      <span />
                      <ChevronRight className="h-4 w-4 tvd-chev" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
