import { SHARE_RECIPIENT_TERM, SHARE_RECIPIENT_TERM_PLURAL } from "@/lib/terms";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentDashboard } from "@/lib/talent.functions";
import { Lock, FileStack, Share2, ChevronRight, Upload, Users, Heart } from "lucide-react";
import { useTalentAgencyLinks } from "@/lib/talent-agency-links";
import { fileKind } from "@/components/shared/brand";

export const Route = createFileRoute("/talent/")({
  head: () => ({
    meta: [
      { title: "Dashboard · TalVault Talent" },
      {
        name: "description",
        content: "Your to-do list, vault summary and sharing at a glance.",
      },
      { property: "og:title", content: "Dashboard · TalVault Talent" },
      {
        property: "og:description",
        content: "Your to-do list, vault summary and sharing at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TalentDashboard,
});
export const __tsProbe: number = "probe";

const fmtDate = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function TalentDashboard() {
  const load = useServerFn(getTalentDashboard);
  const { data, isError: dashError } = useQuery({
    queryKey: ["talent", "dashboard"],
    queryFn: () => load(),
  });
  const agency = useTalentAgencyLinks();

  const ctx = useLoaderData({ from: "/talent" });
  const fullName = ctx?.profile?.full_name ?? "";
  const firstName = fullName.split(/\s+/)[0] || "there";
  const initials =
    fullName
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "T";
  const talentType = ctx?.link?.talent_type?.trim() || null;

  const rels = agency.data?.relationships ?? [];
  const active = rels.filter((r) => r.state === "active");
  const recent = data?.recentDocs ?? [];
  const contacts = data?.trustedContacts ?? [];

  let managedLine = "";
  if (agency.isError)
    managedLine = "We couldn't load your agency details. Please refresh the page.";
  else if (agency.data) {
    managedLine = active.length
      ? `Managed by ${active
          .map((r) =>
            active.length === 1 && r.manager?.name
              ? `${r.agencyName} · ${r.manager.name}`
              : r.agencyName,
          )
          .join(", ")}`
      : "Independent talent";
  }
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="tvd">
      <header className="tvd-band">
        <div className="tvd-who">
          <span className="tvd-avatar" aria-hidden>
            {initials}
          </span>
          <div className="tvd-title">
            <h1 className="tvd-h1">Welcome back, {firstName}</h1>
            <div className="tvd-band-meta">
              {talentType && <span className="tvd-chip">{talentType}</span>}
              {managedLine && <span>{managedLine}</span>}
            </div>
          </div>
        </div>
        <div className="tvd-actions">
          <Link to="/talent/vault" search={{ tab: "private" }} className="tvd-btn tvd-btn-primary">
            <Upload className="h-4 w-4" /> Upload document
          </Link>
          <Link to="/talent/sharing" className="tvd-btn tvd-btn-ghost">
            <Share2 className="h-4 w-4" /> Share with a {SHARE_RECIPIENT_TERM}
          </Link>
        </div>
      </header>

      {dashError && (
        <p className="tvd-meta">
          Some of your dashboard couldn't be loaded. Please refresh the page.
        </p>
      )}

      <div className="tvd-layout">
        <div className="tvd-main">
          <section className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Your vault</h2>
              <Link to="/talent/vault" className="tvp-link">
                Open Vault →
              </Link>
            </div>
            <div className="tvd-cards">
              <Link
                to="/talent/vault"
                search={{ tab: "private" }}
                className="tvd-tile tvd-tint-teal"
              >
                <span className="tvd-tile-icon">
                  <Lock className="h-5 w-5" />
                </span>
                <span className="tvd-tile-count">{data?.privateDocs ?? 0}</span>
                <span className="tvd-tile-label">Private</span>
                <span className="tvd-tile-sub">Just for you — nobody else can see these.</span>
              </Link>
              {rels.map((r) => (
                <Link
                  key={r.linkId}
                  to="/talent/vault"
                  search={{ tab: "agency", link: r.linkId } as any}
                  className="tvd-tile tvd-tint-purple"
                >
                  <span className="tvd-tile-icon">
                    <FileStack className="h-5 w-5" />
                  </span>
                  <span className="tvd-tile-count">{r.sharedDocs}</span>
                  <span className="tvd-tile-label">
                    {r.state === "active" ? "Shared with " : "Previously shared with "}
                    {r.agencyName}
                  </span>
                  <span className="tvd-tile-sub">
                    {r.state === "active"
                      ? `${plural(r.sharedDocs, "document")} you and ${r.agencyName} both see.`
                      : "View only — kept safe for you."}
                  </span>
                </Link>
              ))}
              {!agency.isError && agency.data && rels.length === 0 && (
                <Link to="/talent/sharing" className="tvd-tile tvd-tint-purple">
                  <span className="tvd-tile-icon">
                    <Share2 className="h-5 w-5" />
                  </span>
                  <span className="tvd-tile-count">{data?.activeShares ?? 0}</span>
                  <span className="tvd-tile-label">Shared with {SHARE_RECIPIENT_TERM_PLURAL}</span>
                  <span className="tvd-tile-sub">Secure links you're in control of.</span>
                </Link>
              )}
            </div>

            <h3 className="tvd-sub">Recent documents</h3>
            {recent.length === 0 ? (
              <p className="tvd-meta">
                Nothing here yet — upload your first document and it'll show up here.
              </p>
            ) : (
              <ul className="tvp-review-list tvd-list">
                {recent.map((d) => {
                  const k = fileKind(d.name);
                  return (
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
                        <span className={`tvp-review-icon tvp-bg-${k.tone}`} title={k.label}>
                          <k.Icon className="h-3.5 w-3.5" aria-label={k.label} />
                        </span>
                        <span className="tvd-row-text">
                          <span className="tvp-review-name">{d.name}</span>
                          <span className="tvp-review-meta">
                            {d.folder} · {fmtDate(d.date)}
                          </span>
                        </span>
                        <span
                          className={
                            d.area === "shared" ? "tvp-status tvp-purple" : "tvp-status tvp-teal"
                          }
                        >
                          {d.area === "shared" ? "Shared" : "Private"}
                        </span>
                        <ChevronRight className="h-4 w-4 tvd-chev" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="tvd-side">
          <section className="tvp-card tvp-panel tvd-share">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">
                <Heart className="h-4 w-4 tvd-share-heart" aria-hidden />{" "}
                {SHARE_RECIPIENT_TERM_PLURAL.replace(/^./, (c) => c.toUpperCase())}
              </h2>
              <Link to="/talent/sharing" className="tvp-link">
                Manage →
              </Link>
            </div>
            {contacts.length === 0 ? (
              <div className="tvd-share-empty">
                <p className="tvd-meta">
                  Share selected documents with someone you trust — like a parent, partner or
                  accountant. You choose what they see and for how long.
                </p>
                <Link to="/talent/sharing" className="tvp-primary">
                  <Share2 className="h-4 w-4" /> Share with a {SHARE_RECIPIENT_TERM}
                </Link>
              </div>
            ) : (
              <ul className="tvp-review-list tvd-list">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <Link to="/talent/sharing" className="tvp-review-row tvd-row">
                      <span className="tvp-review-icon tvp-bg-amber">
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
