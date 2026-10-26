import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, FolderOpen, Upload } from "lucide-react";
import {
  agencyWhoami,
  getAgencyTalentDetail,
  listAgencyBillingDocs,
  listAgencyTalent,
  listAgencyVaultDocuments,
} from "@/lib/agency.functions";
import { EntityAvatar } from "@/components/shared/entity-card";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { useTalentLinkRowActions } from "@/components/agency/talent-link-actions";
import { useAgencyReadOnly } from "@/components/agency/agency-read-only";
import {
  BILLING_DOC_STATUS_LABEL,
  BILLING_DOC_STATUS_TONE,
  statusLabel,
  statusPillClass,
} from "@/lib/status-labels";
import { canEndRelationship } from "@/lib/status-actions";
import { fmtMoney } from "@/lib/billing";
import { friendlyError } from "@/lib/friendly-error";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "billing", label: "Quotes & Invoices" },
  { key: "activity", label: "Activity" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const FILTERS = [
  { key: "all", label: "Documents" },
  { key: "awaiting", label: "Awaiting" },
  { key: "expiring", label: "Expiring" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

type Search = { tab?: TabKey; filter?: FilterKey };

export const Route = createFileRoute("/agency/talent/$linkId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(TABS.some((t) => t.key === s.tab) ? { tab: s.tab as TabKey } : {}),
    ...(FILTERS.some((f) => f.key === s.filter) ? { filter: s.filter as FilterKey } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Talent details · TalVault" },
      {
        name: "description",
        content: "One talent's relationship, shared documents, quotes, invoices and activity.",
      },
      { property: "og:title", content: "Talent details · TalVault" },
      {
        property: "og:description",
        content: "See a talent's shared folder, quotes, invoices and recent activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TalentDetailPage,
});

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function humanAction(a: string) {
  return a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function TalentDetailPage() {
  const { linkId } = Route.useParams();
  const search = Route.useSearch();
  const tab: TabKey = search.tab ?? "overview";
  const filter: FilterKey = search.filter ?? "all";
  const readOnly = useAgencyReadOnly();

  const listFn = useServerFn(listAgencyTalent);
  const roster = useQuery({ queryKey: ["agency", "talent"], queryFn: () => listFn() });
  const row = useMemo(
    () => ((roster.data ?? []) as any[]).find((r) => r.id === linkId) ?? null,
    [roster.data, linkId],
  );

  const detailFn = useServerFn(getAgencyTalentDetail);
  const detail = useQuery({
    queryKey: ["agency", "talent-detail", linkId],
    queryFn: () => detailFn({ data: { talent_link_id: linkId } }),
    retry: false,
  });

  const whoFn = useServerFn(agencyWhoami);
  const who = useQuery({ queryKey: ["agency", "whoami"], queryFn: () => whoFn() });
  const rowActions = useTalentLinkRowActions({
    isOwner: (who.data as any)?.role === "owner",
    hideOpen: true,
  });

  const docsFn = useServerFn(listAgencyVaultDocuments);
  const docs = useQuery({
    queryKey: ["agency", "talent-detail", linkId, "docs", filter],
    queryFn: () =>
      docsFn({
        data: {
          talentLinkId: linkId,
          tab: filter === "awaiting" ? "needs_review" : filter === "expiring" ? "expiring" : "all",
          limit: 50,
        },
      }) as Promise<{ rows: any[]; total: number }>,
    enabled: tab === "documents" && !!row,
  });

  const billingFn = useServerFn(listAgencyBillingDocs);
  const billing = useQuery({
    queryKey: ["agency", "billing-docs"],
    queryFn: () => billingFn(),
    enabled: tab === "billing" && !!row,
  });
  const billingRows = useMemo(
    () => ((billing.data ?? []) as any[]).filter((b) => b.talent_link_id === linkId),
    [billing.data, linkId],
  );

  if (roster.isLoading) return <p className="tvp-muted">Loading talent…</p>;
  if (!row || detail.isError) {
    return (
      <div className="tvp-card tvp-panel tvp-empty-state">
        <h1 className="tvp-h2">This talent is not available to you</h1>
        <p className="tvp-muted">
          {detail.isError
            ? friendlyError(detail.error, "This talent is not on your roster.")
            : "This talent is not on your roster, or is no longer available to you."}
        </p>
        <Link to="/agency/talent" className="tvp-secondary">
          Back to talent roster
        </Link>
      </div>
    );
  }

  const canUpload = !readOnly && canEndRelationship(row.status);
  const actions = rowActions(row);
  const ended = row.status === "ended" || row.status === "read_only";

  return (
    <>
      {rowActions.dialog}
      <nav className="tvp-breadcrumb" aria-label="Breadcrumb">
        <Link to="/agency/talent" className="tvp-link">
          Talent roster
        </Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{row.displayName}</span>
      </nav>

      <div className="tvp-topbar">
        <div className="tvp-detail-head">
          <EntityAvatar name={row.displayName} seed={row.id} photoUrl={row.avatarUrl} size="lg" />
          <div>
            <h1 className="tvp-h1">{row.displayName}</h1>
            <div className="tvp-subtitle tvp-detail-meta">
              <span className={statusPillClass("talentLink", row.status)}>
                {statusLabel("talentLink", row.status)}
              </span>
              <span>
                {row.status === "invited" ? "Invited" : "Since"} {fmtDate(row.createdAt)}
              </span>
              <span>{row.talentType ?? "Talent type not set"}</span>
              <span>Manager: {row.managerName || "Unassigned"}</span>
            </div>
          </div>
        </div>
        <div className="tvp-actions">
          {canUpload && (
            <Link to="/agency/document-vault" search={{ talent: row.id }} className="tvp-primary">
              <Upload className="h-4 w-4" />
              Upload document
            </Link>
          )}
          {actions.length > 0 && (
            <RowActionsMenu label={`Actions for ${row.displayName}`} actions={actions} />
          )}
        </div>
      </div>

      <div className="tvp-tabs" role="tablist" aria-label="Talent details">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to="/agency/talent/$linkId"
            params={{ linkId }}
            search={{ tab: t.key }}
            role="tab"
            aria-selected={tab === t.key}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="tvp-detail-grid">
          <section className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Relationship</h2>
            <dl className="tvp-detail-list">
              <dt>Status</dt>
              <dd>{statusLabel("talentLink", row.status)}</dd>
              <dt>Linked to your agency</dt>
              <dd>
                {row.status === "invited"
                  ? "Not yet — invitation not accepted"
                  : ended
                    ? `Ended ${fmtDate(detail.data?.endedAt)} · view only`
                    : `Yes, since ${fmtDate(detail.data?.acceptedAt ?? row.createdAt)}`}
              </dd>
              <dt>Talent type</dt>
              <dd>{row.talentType ?? "Not set"}</dd>
              <dt>Manager</dt>
              <dd>{row.managerName || "Unassigned"}</dd>
            </dl>
          </section>
          <section className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Contact details</h2>
            <dl className="tvp-detail-list">
              <dt>Email</dt>
              <dd>
                {detail.data?.email ? (
                  <a className="tvp-link" href={`mailto:${detail.data.email}`}>
                    {detail.data.email}
                  </a>
                ) : detail.isLoading ? (
                  "Loading…"
                ) : (
                  "Not recorded"
                )}
              </dd>
            </dl>
            <p className="tvp-small tvp-muted">
              The email your agency invited this talent with. Their own profile stays private.
            </p>
          </section>
          <section className="tvp-card tvp-panel">
            <h2 className="tvp-h2">Documents</h2>
            <div className="tvp-entity-stats">
              {[
                { key: "all" as const, label: "Documents", value: row.docCount },
                { key: "awaiting" as const, label: "Awaiting", value: row.awaitingCount },
                { key: "expiring" as const, label: "Expiring", value: row.expiringDocsCount },
              ].map((s) => (
                <Link
                  key={s.key}
                  to="/agency/talent/$linkId"
                  params={{ linkId }}
                  search={{ tab: "documents", filter: s.key }}
                  className="tvp-entity-stat tvp-entity-stat-link"
                >
                  <span className="tvp-entity-stat-value">{s.value}</span>
                  <span className="tvp-entity-stat-label">{s.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "documents" && (
        <section className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <div className="tvp-tabs" role="group" aria-label="Document filter">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  to="/agency/talent/$linkId"
                  params={{ linkId }}
                  search={{ tab: "documents", filter: f.key }}
                  aria-pressed={filter === f.key}
                  className={`tvp-tab${filter === f.key ? " tvp-active" : ""}`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <Link to="/agency/document-vault" search={{ talent: row.id }} className="tvp-secondary">
              <FolderOpen className="h-4 w-4" />
              Open shared folders
            </Link>
          </div>
          <p className="tvp-small tvp-muted">
            Only this talent's agency shared folder. Open shared folders to upload, view or see
            version history.
          </p>
          {docs.isLoading ? (
            <p className="tvp-muted">Loading documents…</p>
          ) : docs.isError ? (
            <p className="tvp-muted">
              {friendlyError(docs.error, "Documents could not be loaded.")}
            </p>
          ) : (docs.data?.rows ?? []).length === 0 ? (
            <p className="tvp-muted">No documents in this view.</p>
          ) : (
            <ul className="tvp-list">
              {docs.data!.rows.map((d: any) => (
                <li key={d.id} className="tvp-list-item">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  <div>
                    <Link
                      to="/agency/document-vault"
                      search={{ talent: row.id, doc: d.id }}
                      className="tvp-link"
                    >
                      {d.name}
                    </Link>
                    <div className="tvp-small tvp-muted">
                      {d.folder}
                      {d.validityExpiresAt ? ` · Expires ${fmtDate(d.validityExpiresAt)}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "billing" && (
        <section className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Quotes & Invoices</h2>
          {billing.isLoading ? (
            <p className="tvp-muted">Loading quotes and invoices…</p>
          ) : billingRows.length === 0 ? (
            <p className="tvp-muted">No quotes or invoices for this talent yet.</p>
          ) : (
            <ul className="tvp-list">
              {billingRows.map((b: any) => (
                <li key={b.id} className="tvp-list-item">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  <div>
                    <Link to="/agency/quotes-invoices" search={{ doc: b.id }} className="tvp-link">
                      {b.kind === "quote" ? "Quote" : "Invoice"} {b.number ?? "(draft)"}
                    </Link>
                    <div className="tvp-small tvp-muted">
                      {b.client_name ?? "No client"} · {fmtDate(b.issued_at ?? b.created_at)}
                    </div>
                  </div>
                  <strong>{fmtMoney(b.total_cents ?? 0, b.currency ?? "ZAR")}</strong>
                  <span
                    className={`tvp-status tvp-${(BILLING_DOC_STATUS_TONE as any)[b.status] ?? "neutral"}`}
                  >
                    {(BILLING_DOC_STATUS_LABEL as any)[b.status] ?? b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "activity" && (
        <section className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Recent activity</h2>
          {detail.isLoading ? (
            <p className="tvp-muted">Loading activity…</p>
          ) : (detail.data?.activity ?? []).length === 0 ? (
            <p className="tvp-muted">No activity recorded for this talent yet.</p>
          ) : (
            <ul className="tvp-list">
              {detail.data!.activity.map((a: any) => (
                <li key={a.id} className="tvp-list-item">
                  <div>
                    <strong>{humanAction(a.action)}</strong>
                    <div className="tvp-small tvp-muted">
                      {[a.label, a.actor, fmtDate(a.at)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
