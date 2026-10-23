import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileStack, Mail, Phone } from "lucide-react";
import { getTalentAgencyRelationships } from "@/lib/talent.functions";
import { friendlyError } from "@/lib/friendly-error";

const fmt = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "A";

export function AgencyRelationshipsPanel() {
  const load = useServerFn(getTalentAgencyRelationships);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talent", "agency-relationships"],
    queryFn: () => load(),
  });

  if (isLoading)
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvr-meta">Loading your agency details…</p>
      </div>
    );
  if (isError)
    return (
      <div className="tvp-card tvp-panel">
        <p className="tvr-meta">{friendlyError(error, "Your agency details couldn't be loaded. Please try again.")}</p>
      </div>
    );

  const rels = data?.relationships ?? [];
  return (
    <div className="tvr">
      {rels.map((r) => (
        <section key={r.linkId} className="tvr-block">
          <div className="tvp-card tvp-panel tvr-card">
            <div className="tvr-head">
              {r.logoUrl ? (
                <img src={r.logoUrl} alt="" className="tvr-logo" />
              ) : (
                <span className="tvr-logo tvr-initials" aria-hidden>
                  {initials(r.agencyName)}
                </span>
              )}
              <div className="tvr-title">
                <h2 className="tvp-h2">{r.agencyName}</h2>
                <span className="tvr-meta">
                  {r.linkedSince ? `Linked since ${fmt(r.linkedSince)}` : null}
                  {r.state === "previous" && r.endedAt ? ` · Ended on ${fmt(r.endedAt)}` : null}
                </span>
              </div>
              <span className={r.state === "active" ? "tvp-status st-accepted" : "tvp-status st-neutral"}>
                {r.state === "active" ? "Active" : "Ended"}
              </span>
            </div>

            <div className="tvr-grid">
              {r.manager && (r.manager.name || r.manager.email || r.manager.phone) && (
                <div>
                  <h3 className="tvr-label">Your manager</h3>
                  {r.manager.name && <div className="tvr-value">{r.manager.name}</div>}
                  {r.manager.email && (
                    <span className="tvr-contact">
                      <Mail className="h-3.5 w-3.5" aria-hidden /> {r.manager.email}
                    </span>
                  )}
                  {r.manager.phone && (
                    <span className="tvr-contact">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {r.manager.phone}
                    </span>
                  )}
                </div>
              )}
              {(r.agencyEmail || r.agencyPhone) && (
                <div>
                  <h3 className="tvr-label">Agency contact</h3>
                  {r.agencyEmail && (
                    <span className="tvr-contact">
                      <Mail className="h-3.5 w-3.5" aria-hidden /> {r.agencyEmail}
                    </span>
                  )}
                  {r.agencyPhone && (
                    <span className="tvr-contact">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {r.agencyPhone}
                    </span>
                  )}
                </div>
              )}
              <div>
                <h3 className="tvr-label">What's shared</h3>
                <div className="tvr-value">
                  {r.sharedDocs} document{r.sharedDocs === 1 ? "" : "s"}
                </div>
                <Link
                  to="/talent/vault"
                  search={{ tab: "agency", link: r.linkId } as any}
                  className="tvp-link tvr-contact"
                >
                  <FileStack className="h-3.5 w-3.5" aria-hidden /> View shared documents
                </Link>
              </div>
            </div>
          </div>
          <p className="tvr-note">
            {r.state === "active"
              ? `If this relationship ends, you'll keep view-only access to documents shared between you and ${r.agencyName}. Your private vault is always yours alone.`
              : `This relationship has ended. You have view-only access to documents shared between you and ${r.agencyName}. Your private vault is always yours alone.`}
          </p>
        </section>
      ))}
    </div>
  );
}
