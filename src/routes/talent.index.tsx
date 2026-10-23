import { SHARE_RECIPIENT_TERM, SHARE_RECIPIENT_TERM_PLURAL } from "@/lib/terms";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentDashboard } from "@/lib/talent.functions";
import { Lock, FileStack, Inbox, Clock, Share2, ArrowRight, AlertCircle, Upload, CheckCircle2 } from "lucide-react";

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
};

function todoLink(t: TodoItem): { to: string; search?: Record<string, string> } {
  if (t.type === "request") return { to: "/talent/vault", search: { tab: "agency", view: "requests" } };
  if (t.targetType === "shared_document" && t.targetId)
    return { to: "/talent/vault", search: { tab: "agency", view: "folder", doc: t.targetId } };
  if (t.targetType === "private_document" && t.targetId)
    return { to: "/talent/vault", search: { tab: "private", doc: t.targetId } };
  return { to: "/talent/notifications" };
}

function TalentDashboard() {
  const load = useServerFn(getTalentDashboard);
  const { data } = useQuery({ queryKey: ["talent", "dashboard"], queryFn: () => load() });

  const rootMatch = useRouterState({
    select: (s) => s.matches.find((m) => m.routeId === "/talent"),
  });
  const ctx = (rootMatch?.loaderData ?? null) as {
    profile: { full_name: string } | null;
    agency: { name: string } | null;
  } | null;
  const firstName = (ctx?.profile?.full_name ?? "").split(/\s+/)[0] || "there";
  const hasLink = !!data?.hasLink && !!ctx?.agency;
  const agencyName = ctx?.agency?.name ?? "";
  const todo = (data?.todo ?? []) as TodoItem[];
  const recent = data?.recentDocs ?? [];
  const contacts = data?.trustedContacts ?? [];

  const subLine = hasLink
    ? `Managed by ${agencyName}${data?.managerName ? ` · ${data.managerName}` : ""}`
    : data
      ? "Independent talent"
      : "";

  return (
    <div className="tvd">
      <div className="tvp-topbar tvd-top">
        <div>
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

      <section className="tvp-card tvp-panel tvd-section" data-tour="needs-attention">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">To do</h2>
        </div>
        {todo.length === 0 ? (
          <p className="tvd-empty">
            <CheckCircle2 className="h-4 w-4" /> You're all caught up.
          </p>
        ) : (
          <ul className="tvd-list">
            {todo.map((item) => {
              const l = todoLink(item);
              const title =
                item.type === "request" && hasLink && !item.title.startsWith("Resubmission")
                  ? item.title.replace(/^Requested:/, `Requested by ${agencyName}:`)
                  : item.title;
              return (
                <li key={item.key}>
                  <Link to={l.to} search={l.search as any} className="tvd-row">
                    <span className={`tvp-review-icon tvp-bg-${item.tone}`}>
                      {item.type === "request" ? (
                        item.tone === "amber" ? <AlertCircle className="h-3.5 w-3.5" /> : <Inbox className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="tvd-row-text">
                      <span className="tvd-row-title">{title}</span>
                      <span className="tvd-row-meta">{item.detail}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 tvd-row-arrow" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {hasLink && (data?.actionRequests ?? 0) > 0 && (
          <Link to="/talent/vault" search={{ tab: "agency", view: "requests" }} className="tvp-link tvd-more">
            Requests from {agencyName} ({data?.actionRequests}) →
          </Link>
        )}
      </section>

      <section className="tvp-card tvp-panel tvd-section">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Vault</h2>
          <Link to="/talent/vault" className="tvp-link">
            Open Vault →
          </Link>
        </div>
        <div className={`tvd-grid ${hasLink ? "tvd-grid-2" : ""}`}>
          <Link to="/talent/vault" search={{ tab: "private" }} className="tvp-doc-card tvp-clickable tvd-card">
            <div className="tvp-kpi-icon tvp-bg-teal tvd-icon">
              <Lock className="h-4 w-4" />
            </div>
            <div className="tvd-card-body">
              <strong>Private</strong>
              <span className="tvd-row-meta">Only you can see these.</span>
            </div>
            <div className="tvd-count">
              <span className="tvp-kpi-value">{data?.privateDocs ?? 0}</span>
              <span className="tvd-row-meta">document{(data?.privateDocs ?? 0) === 1 ? "" : "s"}</span>
            </div>
          </Link>
          {hasLink && (
            <Link to="/talent/vault" search={{ tab: "agency" }} className="tvp-doc-card tvp-clickable tvd-card">
              <div className="tvp-kpi-icon tvp-bg-blue tvd-icon">
                <FileStack className="h-4 w-4" />
              </div>
              <div className="tvd-card-body">
                <strong>Shared with {agencyName}</strong>
                <span className="tvd-row-meta">Documents shared between you and {agencyName}.</span>
              </div>
              <div className="tvd-count">
                <span className="tvp-kpi-value">{data?.sharedDocs ?? 0}</span>
                <span className="tvd-row-meta">document{(data?.sharedDocs ?? 0) === 1 ? "" : "s"}</span>
              </div>
            </Link>
          )}
        </div>
        <h3 className="tvd-sub">Recent documents</h3>
        {recent.length === 0 ? (
          <p className="tvd-empty">No documents yet. Upload your first one to get started.</p>
        ) : (
          <ul className="tvd-list">
            {recent.map((d) => (
              <li key={`${d.area}:${d.id}`}>
                <Link
                  to="/talent/vault"
                  search={
                    (d.area === "shared"
                      ? { tab: "agency", view: "folder", doc: d.id }
                      : { tab: "private", doc: d.id }) as any
                  }
                  className="tvd-row"
                >
                  <span className="tvd-row-text">
                    <span className="tvd-row-title">{d.name}</span>
                    <span className="tvd-row-meta">
                      {d.folder} · {fmtDate(d.date)}
                    </span>
                  </span>
                  <span className={d.area === "shared" ? "tvp-status tvp-blue" : "tvp-status tvp-green"}>
                    {d.area === "shared" ? "Shared" : "Private"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tvp-card tvp-panel tvd-section">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Sharing</h2>
          <Link to="/talent/sharing" className="tvp-link">
            Manage sharing →
          </Link>
        </div>
        {contacts.length === 0 ? (
          <div className="tvd-share-empty">
            <p className="tvd-row-meta">
              Give a {SHARE_RECIPIENT_TERM} access to chosen documents through a secure link. You decide what they see
              and when their access ends.
            </p>
            <Link to="/talent/sharing" className="tvp-secondary">
              <Share2 className="h-4 w-4" /> Share with a {SHARE_RECIPIENT_TERM}
            </Link>
          </div>
        ) : (
          <>
            <p className="tvd-row-meta">
              {data?.activeShares ?? contacts.length} active {SHARE_RECIPIENT_TERM_PLURAL}
            </p>
            <ul className="tvd-list">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link to="/talent/sharing" className="tvd-row">
                    <span className="tvd-row-text">
                      <span className="tvd-row-title">{c.name}</span>
                      <span className="tvd-row-meta">
                        {c.expiresAt ? `Access ends ${fmtDate(c.expiresAt)}` : "No end date"}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 tvd-row-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
