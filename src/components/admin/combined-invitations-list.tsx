import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { statusLabel, statusPillClass } from "@/lib/status-labels";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { useTalentInvitationActions } from "@/components/admin/talent-invitation-actions";
import { useAgencyInvitationActions } from "@/components/admin/agency-invitation-actions";
import { PAGE_SIZE } from "@/lib/pagination";
import { LoadMoreRow } from "@/components/shared/load-more";
import { FilterBar } from "@/components/shared/filter-bar";
import { ACCOUNT_SCOPE_LABEL, type AccountScope } from "@/lib/account-filters";
import { listCombinedInvitations } from "@/lib/admin.functions";
import {
  INVITATION_STATUSES,
  INVITATION_TYPES,
  statusOptionCounts,
  typeOptionCounts,
  type InvitationType,
} from "@/lib/invitation-filters";

const INVITATION_TYPE_LABEL: Record<InvitationType, string> = {
  agency: "Agency",
  talent: "Talent",
};

/**
 * The one Admin invitations list (agency + talent), shared by the overview
 * section and the Invitations page. Filters are owned by the caller (URL).
 */
export function CombinedInvitationsList({
  type,
  status,
  email,
  accounts = "all",
  onFilterChange,
  onClear,
  viewAllSearch,
  tourId,
}: {
  type: InvitationType | "all";
  status: string;
  email?: string;
  /** Real/test accounts filter (default all). */
  accounts?: AccountScope;
  onFilterChange: (next: { type?: string; status?: string; accounts?: string }) => void;
  onClear: () => void;
  /** When set, shows "View all invitations" linking to the Invitations page with these filters. */
  viewAllSearch?: Record<string, string>;
  tourId?: string;
}) {
  const listFn = useServerFn(listCombinedInvitations);
  const invites = useInfiniteQuery({
    queryKey: ["admin", "combined-invitations", type, status, email ?? "", accounts],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listFn({
        data: {
          type,
          status,
          email: email ?? "",
          accounts,
          limit: PAGE_SIZE,
          offset: pageParam as number,
        },
      }),
    getNextPageParam: (last: any, all: any[]) => {
      const loaded = all.reduce((n, p: any) => n + (p.rows?.length ?? 0), 0);
      return loaded < (last?.total ?? 0) && loaded < 500 ? loaded : undefined;
    },
  });
  const rows = useMemo(
    () => (invites.data?.pages ?? []).flatMap((p: any) => p.rows ?? []),
    [invites.data?.pages],
  );
  const firstPage: any = invites.data?.pages?.[0];
  const total = firstPage?.total ?? 0;
  const rawCounts = firstPage?.counts ?? { agency: {}, talent: {} };
  const typeCounts = typeOptionCounts(rawCounts, status);
  const statusCounts = statusOptionCounts(rawCounts, type);
  const filtersActive = type !== "all" || status !== "all" || !!email || accounts !== "all";
  const activeFilterText = [
    type !== "all" ? `Type: ${INVITATION_TYPE_LABEL[type]}` : null,
    status !== "all" ? `Status: ${statusLabel("invitation", status)}` : null,
    email ? `Email: ${email}` : null,
    accounts !== "all" ? `Accounts: ${ACCOUNT_SCOPE_LABEL[accounts]}` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const talentActions = useTalentInvitationActions();
  const agencyActions = useAgencyInvitationActions();

  return (
    <div className="tvp-card tvp-panel" data-tour={tourId}>
      <div className="tvp-panel-head">
        <h2 className="tvp-h2">Invitations</h2>
        {viewAllSearch && (
          <Link to="/admin/invitations" search={viewAllSearch as any} className="tvp-link">
            View all invitations →
          </Link>
        )}
      </div>

      <FilterBar
        active={filtersActive}
        onClear={onClear}
        onChange={(key, value) => onFilterChange({ [key]: value })}
        filters={[
          {
            key: "type",
            label: "Type",
            value: type,
            options: (["all", ...INVITATION_TYPES] as const).map((t) => ({
              value: t,
              label: t === "all" ? "All users" : INVITATION_TYPE_LABEL[t],
              count: typeCounts[t] ?? 0,
            })),
          },
          {
            key: "status",
            label: "Status",
            value: status,
            options: ["all", ...INVITATION_STATUSES].map((s) => ({
              value: s,
              label: s === "all" ? "All statuses" : statusLabel("invitation", s),
              count: statusCounts[s] ?? 0,
            })),
          },
          {
            key: "accounts",
            label: "Accounts",
            value: accounts,
            options: (["all", "real", "test"] as const).map((v) => ({
              value: v,
              label: ACCOUNT_SCOPE_LABEL[v],
            })),
          },
        ]}
      />

      <div className="tvp-table-wrap">
        <table className="tvp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Type</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.isLoading && (
              <tr>
                <td colSpan={7} className="tvp-muted">
                  Loading invitations…
                </td>
              </tr>
            )}
            {!invites.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="tvp-muted">
                  {filtersActive ? (
                    <>
                      No invitations match {activeFilterText}.{" "}
                      <button type="button" className="tvp-link" onClick={onClear}>
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <>
                      No invitations yet.{" "}
                      <Link to="/admin/invitations/new" className="tvp-link">
                        New invitation
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={`${r.type}-${r.id}`}>
                <td>
                  {r.type === "talent" ? (
                    <Link
                      to="/admin/invitations/talent/$id"
                      params={{ id: r.id }}
                      className="text-ink"
                    >
                      <strong>{r.name}</strong>
                    </Link>
                  ) : (
                    <strong>{r.name}</strong>
                  )}
                  {r.is_test && <span className="tvp-status st-neutral tvp-test-label">Test</span>}
                </td>
                <td>{r.email}</td>
                <td>
                  <span className="tvp-status st-neutral">
                    {INVITATION_TYPE_LABEL[r.type as InvitationType]}
                  </span>
                </td>
                <td>
                  <span className={statusPillClass("invitation", r.status)}>
                    {statusLabel("invitation", r.status)}
                  </span>
                </td>
                <td>
                  {r.status === "draft" ? (
                    <span className="tvp-muted">Saved {fmt(r.updated_at ?? r.created_at)}</span>
                  ) : (
                    fmt(r.last_sent_at)
                  )}
                </td>
                <td>
                  {r.status === "pending" || r.status === "expired" ? fmt(r.expires_at) : "—"}
                </td>
                <td>
                  <RowActionsMenu
                    actions={r.type === "talent" ? talentActions(r) : agencyActions.actionsFor(r)}
                  />
                </td>
              </tr>
            ))}
            <LoadMoreRow
              colSpan={7}
              noun="invitations"
              shown={rows.length}
              total={total}
              hasMore={!!invites.hasNextPage}
              loading={invites.isFetchingNextPage}
              onLoadMore={() => invites.fetchNextPage()}
            />
          </tbody>
        </table>
      </div>
      {agencyActions.dialogs}
    </div>
  );
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
