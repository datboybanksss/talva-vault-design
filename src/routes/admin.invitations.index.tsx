import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { statusLabel, statusPillClass, statusToken } from "@/lib/status-labels";
import { invitationActions } from "@/lib/status-actions";
import {
  Send,
  Link2,
  RefreshCw,
  Ban,
  Pencil,
  X,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileEdit,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyInvitationsPaged,
  resendInvitation,
  revokeInvitation,
  updateInvitationEmail,
  logCopyLink,
  deleteAgencyInvitation,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { sendAgencyInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_INVITATION_SUBJECT,
  DEFAULT_INVITATION_BODY,
  EMAIL_FALLBACK_NOTICE,
} from "@/lib/invitation-email";
import { PAGE_SIZE } from "@/lib/pagination";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { LoadMoreRow } from "@/components/shared/load-more";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { listIndependentTalentInvitations } from "@/lib/independent-talent.functions";
import { useTalentInvitationActions } from "@/components/admin/talent-invitation-actions";
import { useAgencyInvitationActions } from "@/components/admin/agency-invitation-actions";

export const Route = createFileRoute("/admin/invitations/")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { email?: string; type?: "agency" | "talent" } => ({
    ...(typeof raw.email === "string" && raw.email ? { email: raw.email } : {}),
    ...(raw.type === "agency" || raw.type === "talent" ? { type: raw.type } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Invitations · TalVault Admin" },
      {
        name: "description",
        content: "Agency and talent invitations in one list, with status, expiry and actions.",
      },
    ],
  }),
  component: InvitationsPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function daysBetween(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function InvitationsPage() {
  const listFn = useServerFn(listAgencyInvitationsPaged);
  const resendFn = useServerFn(resendInvitation);
  const sendAgencyEmailFn = useServerFn(sendAgencyInvitationEmail);
  const revokeFn = useServerFn(revokeInvitation);
  const updateEmailFn = useServerFn(updateInvitationEmail);
  const logCopyFn = useServerFn(logCopyLink);
  const deleteFn = useServerFn(deleteAgencyInvitation);
  const nav = useNavigate();
  const qc = useQueryClient();

  // Filters live above the query so the database does the filtering, the
  // counting and the windowing — the full invitation list is never fetched.
  const { email: emailParam, type: typeParam } = Route.useSearch();
  const [tab, setTab] = useState<string>("all");
  const [type, setType] = useState<"all" | "agency" | "talent">(typeParam ?? "all");
  const listTalentFn = useServerFn(listIndependentTalentInvitations);
  const talentQ = useQuery({
    queryKey: ["admin", "talent-invitations"],
    queryFn: () => listTalentFn(),
  });
  const talentActions = useTalentInvitationActions();
  const [search, setSearch] = useState(emailParam ?? "");

  const invites = useInfiniteQuery({
    queryKey: ["admin", "invitations", tab, search],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listFn({ data: { status: tab, search, limit: PAGE_SIZE, offset: pageParam as number } }),
    getNextPageParam: (lastPage: any, allPages: any[]) => {
      const loaded = allPages.reduce((n, p: any) => n + (p.rows?.length ?? 0), 0);
      return loaded < (lastPage?.total ?? 0) ? loaded : undefined;
    },
  });

  const agencyActions = useAgencyInvitationActions();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // When arriving with ?email=..., prefill the search box, find the matching
  // pending invite, scroll to it, and flash the row so it's obvious.
  useEffect(() => {
    if (!emailParam || !invites.data) return;
    setSearch(emailParam);
    const match = (invites.data.pages ?? [])
      .flatMap((p: any) => p.rows ?? [])
      .find((i: any) => (i.email ?? "").toLowerCase() === emailParam.toLowerCase());
    if (!match) return;
    setHighlightId(match.id);
    // Wait a tick so the filtered row is rendered.
    const t = setTimeout(() => {
      rowRefs.current[match.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const clear = setTimeout(() => setHighlightId(null), 2400);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [emailParam, invites.data]);

  const pages = useMemo(() => invites.data?.pages ?? [], [invites.data?.pages]);
  const visible = useMemo(() => pages.flatMap((p: any) => p.rows ?? []), [pages]);
  // Tab counts are counted in the database, not derived from loaded rows.
  const agencyCounts: Record<string, number> = useMemo(() => pages[0]?.counts ?? {}, [pages]);
  const total = (pages[0] as any)?.total ?? 0;

  // Admin-sent talent invitations are few, so they are filtered here; the
  // agency list stays filtered and paged by the database.
  const talentAll: any[] = useMemo(() => talentQ.data ?? [], [talentQ.data]);
  const talentCounts = useMemo(() => {
    const c: Record<string, number> = { all: talentAll.length };
    for (const t of talentAll) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [talentAll]);
  const counts: Record<string, number> = useMemo(() => {
    const keys = new Set([...Object.keys(agencyCounts), ...Object.keys(talentCounts)]);
    const out: Record<string, number> = {};
    for (const k of keys) {
      out[k] =
        (type !== "talent" ? (agencyCounts[k] ?? 0) : 0) +
        (type !== "agency" ? (talentCounts[k] ?? 0) : 0);
    }
    return out;
  }, [agencyCounts, talentCounts, type]);
  const talentVisible = useMemo(() => {
    if (type === "agency") return [];
    const q = search.trim().toLowerCase();
    return talentAll.filter(
      (t) =>
        (tab === "all" || t.status === tab) &&
        (!q || `${t.talent_name} ${t.email}`.toLowerCase().includes(q)),
    );
  }, [talentAll, type, tab, search]);
  const agencyRows = type === "talent" ? [] : visible;

  const filtersActive = tab !== "all" || !!search || type !== "all";
  const resetFilters = () => {
    setTab("all");
    setSearch("");
    setType("all");
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Invitations</h1>
          <div className="tvp-subtitle">
            Unique link per recipient. Copy never extends expiry. All actions are audit logged.
          </div>
        </div>
        <div className="tvp-actions" data-tour="admin-invite-actions">
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Send className="h-4 w-4" />
            New invitation
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="tvp-grid tvp-kpi-grid" data-tour="admin-invite-kpis">
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("all")}>
          <div className="tvp-kpi-icon tvp-bg-teal">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{counts.all}</div>
            <div className="tvp-kpi-label">Total Invitations</div>
            <div
              className="tvp-kpi-sub"
              style={{ color: counts.all > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}
            >
              {counts.all > 0 ? "Across all statuses" : "None sent yet"}
            </div>
          </div>
        </button>
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("pending")}>
          <div className="tvp-kpi-icon tvp-bg-amber">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{counts.pending ?? 0}</div>
            <div className="tvp-kpi-label">Awaiting Acceptance</div>
            <div
              className="tvp-kpi-sub tvp-warn"
              style={{ color: (counts.pending ?? 0) > 0 ? "var(--tvp-amber)" : "var(--tvp-muted)" }}
            >
              {(counts.pending ?? 0) > 0 ? "Follow up if stale" : "No outstanding invites"}
            </div>
          </div>
        </button>
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("accepted")}>
          <div className="tvp-kpi-icon tvp-bg-green">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{counts.accepted ?? 0}</div>
            <div className="tvp-kpi-label">Accepted</div>
            <div
              className="tvp-kpi-sub"
              style={{
                color: (counts.accepted ?? 0) > 0 ? "var(--tvp-green)" : "var(--tvp-muted)",
              }}
            >
              {(counts.accepted ?? 0) > 0 ? "Onboarded successfully" : "None yet"}
            </div>
          </div>
        </button>
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("expired")}>
          <div className="tvp-kpi-icon tvp-bg-red">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="tvp-kpi-value">{counts.expired ?? 0}</div>
            <div className="tvp-kpi-label">Expired / Lapsed</div>
            <div
              className="tvp-kpi-sub"
              style={{ color: (counts.expired ?? 0) > 0 ? "var(--tvp-red)" : "var(--tvp-green)" }}
            >
              {(counts.expired ?? 0) > 0 ? "Resend to reopen" : "All fresh"}
            </div>
          </div>
        </button>
      </div>

      {/* Life chip row */}
      <div className="tvp-life-chips">
        {["all", "draft", "pending", "accepted", "expired", "declined", "revoked"].map((k) => (
          <button
            key={k}
            className={`tvp-life-chip${tab === k ? " tvp-active-filter" : ""} ${k === "all" ? "tvp-bg-teal" : `tvp-bg-st-${statusToken("invitation", k)}`}`}
            onClick={() => setTab(k)}
          >
            <div className="tvp-label">{k === "all" ? "All" : statusLabel("invitation", k)}</div>
            <div className="tvp-num">{counts[k] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search agency, email, contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Type"
            data-tour="admin-invite-type"
            value={type}
            onChange={(e) => setType(e.target.value as "all" | "agency" | "talent")}
            style={{ maxWidth: 160 }}
          >
            <option value="all">All types</option>
            <option value="agency">Agency</option>
            <option value="talent">Talent</option>
          </select>
          {filtersActive && (
            <button className="tvp-link" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table" data-tour="admin-invite-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Expires</th>
                <th>Sends</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.isLoading && (
                <tr>
                  <td colSpan={8} className="tvp-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!invites.isLoading && agencyRows.length === 0 && talentVisible.length === 0 && (
                <tr>
                  <td colSpan={8} className="tvp-muted">
                    No invitations match.{" "}
                    <Link to="/admin/invitations/new" className="tvp-link">
                      New invitation
                    </Link>
                  </td>
                </tr>
              )}
              {talentVisible.map((t: any) => {
                const dLeft = daysBetween(t.expires_at);
                const isOpen = t.status === "pending";
                return (
                  <tr key={`talent-${t.id}`}>
                    <td>
                      <span className="tvp-status tvp-neutral">Talent</span>
                    </td>
                    <td>
                      <Link
                        to="/admin/invitations/talent/$id"
                        params={{ id: t.id }}
                        className="text-ink"
                      >
                        <strong>{t.talent_name}</strong>
                      </Link>
                      <br />
                      <span className="tvp-muted">Documents {t.doc_count}/2</span>
                    </td>
                    <td>{t.email}</td>
                    <td>
                      <span className={statusPillClass("invitation", t.status)}>
                        {statusLabel("invitation", t.status)}
                      </span>
                    </td>
                    <td>{t.last_sent_at ? fmtDate(t.last_sent_at) : "—"}</td>
                    <td>
                      <span
                        className={`tvp-status tvp-${isOpen && dLeft <= 3 ? "amber" : "neutral"}`}
                      >
                        {isOpen ? `${dLeft} day${dLeft === 1 ? "" : "s"}` : "—"}
                      </span>
                    </td>
                    <td>{t.send_count ?? 0}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <RowActionsMenu actions={talentActions(t)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {agencyRows.map((i: any) => {
                const dLeft = daysBetween(i.expires_at);
                const isOpen = (i.stored_status ?? i.status) === "pending";
                const expiryTone =
                  isOpen && dLeft < 0 ? "red" : isOpen && dLeft <= 3 ? "amber" : "neutral";
                const expiryLabel = !isOpen
                  ? "—"
                  : dLeft < 0
                    ? "Expired"
                    : `${dLeft} day${dLeft === 1 ? "" : "s"}`;
                const allowed = invitationActions({
                  status: i.status,
                  storedStatus: i.stored_status,
                  viewer: "admin",
                  canWrite: true,
                });
                return (
                  <tr
                    key={i.id}
                    ref={(el) => {
                      rowRefs.current[i.id] = el;
                    }}
                    className={highlightId === i.id ? "tvp-row-flash" : undefined}
                  >
                    <td>
                      <span className="tvp-status tvp-neutral">Agency</span>
                    </td>
                    <td>
                      <strong>{i.agency_name}</strong>
                      {i.contact_person && (
                        <>
                          <br />
                          <span className="tvp-muted">{i.contact_person}</span>
                        </>
                      )}
                    </td>
                    <td>{i.email}</td>
                    <td>
                      <span className={statusPillClass("invitation", i.status)}>
                        {statusLabel("invitation", i.status)}
                      </span>
                    </td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>
                      <span className={`tvp-status tvp-${expiryTone}`}>{expiryLabel}</span>
                    </td>
                    <td>{i.send_count}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <RowActionsMenu actions={agencyActions.actionsFor(i)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {type !== "talent" && (
                <LoadMoreRow
                  colSpan={8}
                  noun="agency invitations"
                  shown={visible.length}
                  total={total}
                  hasMore={!!invites.hasNextPage}
                  loading={invites.isFetchingNextPage}
                  onLoadMore={() => invites.fetchNextPage()}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {agencyActions.dialogs}
    </>
  );
}
