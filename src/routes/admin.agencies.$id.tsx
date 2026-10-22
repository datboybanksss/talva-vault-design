import { usePagedList } from "@/lib/pagination";
import { statusLabel, statusPillClass } from "@/lib/status-labels";
import { effectiveInvitationStatus } from "@/lib/invitation-status";
import { LoadMoreRow } from "@/components/shared/load-more";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useSessionReady } from "@/hooks/use-session-ready";
import { ArrowLeft, Send, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAgencyById,
  setAccountTest,
  listAgencyInvitationsForAgency,
  listTalentInvitationsForAgency,
  whoami,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { useAccountStateActions } from "@/components/admin/account-state-actions";
import { AccountStateDetails } from "@/components/admin/account-state-details";
import { accountStateActions, ACCOUNT_ACTION_LABEL } from "@/lib/account-state";
import { agencyAccountStatus } from "@/lib/account-filters";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/admin/agencies/$id")({
  head: () => ({ meta: [{ title: "Agency · TalVault Admin" }] }),
  component: AgencyDetail,
});

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function AgencyDetail() {
  const { id } = useParams({ from: "/admin/agencies/$id" });
  const getFn = useServerFn(getAgencyById);
  const accountState = useAccountStateActions();
  const listAgencyInvFn = useServerFn(listAgencyInvitationsForAgency);
  const listTalentInvFn = useServerFn(listTalentInvitationsForAgency);
  const sessionReady = useSessionReady();
  const whoamiFn = useServerFn(whoami);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "agency", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const agencyInv = useQuery({
    queryKey: ["admin", "agency", id, "agency-invitations"],
    queryFn: () => listAgencyInvFn({ data: { agency_id: id } }),
  });
  const talentInv = useQuery({
    queryKey: ["admin", "agency", id, "talent-invitations"],
    queryFn: () => listTalentInvFn({ data: { agency_id: id } }),
  });
  // Rule of 10: both invitation tables cap at a batch with "Load more".
  const agencyInvPage = usePagedList<any>((agencyInv.data ?? []) as any[]);
  const talentInvPage = usePagedList<any>((talentInv.data ?? []) as any[]);
  // Suspending or reinstating an agency needs full edit rights; anything less
  // is shown the control disabled rather than a server-side "Forbidden".
  const me = useQuery({
    queryKey: ["whoami"],
    queryFn: () => whoamiFn(),
    enabled: sessionReady,
    retry: false,
  });
  const canEdit = !!me.data?.canEdit;
  const noEditTitle =
    "You need full edit access to pause or suspend an account. Ask a Main Administrator to change your access level.";

  const a = q.data as any;
  const setTestFn = useServerFn(setAccountTest);
  const testM = useMutation({
    mutationFn: (isTest: boolean) => setTestFn({ data: { type: "agency", id, isTest } }),
    onSuccess: (_r, isTest) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(isTest ? "Marked as a test account and logged." : "Marked as a real account and logged.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't change the account type.")),
  });
  const toggleTest = () => {
    const next = !a?.is_test;
    const msg = next
      ? `Mark ${a.name} as a test account? It will be left out of reports and launch offer places by default.`
      : `Mark ${a.name} as a real account? It will be counted in reports again.`;
    if (confirm(msg)) testM.mutate(next);
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link
            to="/admin/accounts"
            search={{ type: "agency" }}
            className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
          >
            <ArrowLeft className="h-3 w-3" /> Back to accounts
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>
            {a?.name ?? (q.isLoading ? "Loading…" : "Agency not found")}
          </h1>
          {a && (
            <div
              className="tvp-subtitle"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <span className={statusPillClass("agency", agencyAccountStatus(a))}>
                {statusLabel("agency", agencyAccountStatus(a))}
              </span>
              {a.is_test && <span className="tvp-status st-neutral">Test</span>}
              {a.contact_email}
            </div>
          )}
        </div>
        {a && (
          <div className="tvp-actions">
            <button
              className="tvp-secondary"
              onClick={toggleTest}
              disabled={!canEdit || testM.isPending}
              title={canEdit ? undefined : "You need full edit access to change the account type."}
            >
              {a.is_test ? "Mark as real account" : "Mark as test account"}
            </button>
            {accountStateActions(
              { paused: !!a.paused_at, suspended: a.status === "suspended" },
              true,
            ).map((action) => (
              <button
                key={action}
                className="tvp-secondary"
                disabled={!canEdit}
                title={canEdit ? undefined : noEditTitle}
                onClick={() =>
                  accountState.openAction(
                    {
                      type: "agency",
                      id: a.id,
                      name: a.name,
                      paused: !!a.paused_at,
                      suspended: a.status === "suspended",
                    },
                    action,
                  )
                }
              >
                {ACCOUNT_ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        )}
      </div>

      {a && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Agency details</h2>
          <div className="tvp-form-layout" style={{ marginTop: 12 }}>
            <div>
              <p>
                <strong>Contact person</strong>
                <br />
                {a.contact_person ?? "—"}
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>Contact email</strong>
                <br />
                {a.contact_email ?? "—"}
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>Phone</strong>
                <br />
                {a.phone ?? "—"}
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>Country</strong>
                <br />
                {a.country ?? "—"}
              </p>
            </div>
            <div>
              <p>
                <strong>Created</strong>
                <br />
                {new Date(a.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <AccountStateDetails row={a} suspended={a.status === "suspended"} />
              {a.notes && (
                <p style={{ marginTop: 10 }}>
                  <strong>Notes</strong>
                  <br />
                  {a.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {a && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <h2 className="tvp-h2" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Send className="h-4 w-4" /> Agency users invited
            </h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              Invitations sent by admin to onboard this agency (ADM-V1-012).
            </span>
          </div>
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Expires</th>
                  <th>Sends</th>
                </tr>
              </thead>
              <tbody>
                {agencyInv.isLoading && (
                  <tr>
                    <td colSpan={6} className="tvp-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!agencyInv.isLoading && (agencyInv.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="tvp-muted">
                      No team invitations from this agency yet — colleagues they invite will appear
                      here.
                    </td>
                  </tr>
                )}
                {agencyInvPage.visible.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{i.contact_person ?? "—"}</td>
                    <td>
                      <span
                        className={statusPillClass(
                          "invitation",
                          effectiveInvitationStatus(i.status, i.expires_at),
                        )}
                      >
                        {statusLabel(
                          "invitation",
                          effectiveInvitationStatus(i.status, i.expires_at),
                        )}
                      </span>
                    </td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>{fmtDate(i.expires_at)}</td>
                    <td>{i.send_count}</td>
                  </tr>
                ))}
                <LoadMoreRow
                  colSpan={6}
                  noun="invitations"
                  shown={agencyInvPage.shown}
                  total={agencyInvPage.total}
                  hasMore={agencyInvPage.hasMore}
                  onLoadMore={agencyInvPage.loadMore}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {a && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <h2 className="tvp-h2" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Users className="h-4 w-4" /> Talent invited by this agency
            </h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              Invitations this agency has sent to Talent. Separate from the agency-user invitations
              above.
            </span>
          </div>
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Talent</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Expires</th>
                  <th>Sends</th>
                </tr>
              </thead>
              <tbody>
                {talentInv.isLoading && (
                  <tr>
                    <td colSpan={6} className="tvp-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!talentInv.isLoading && (talentInv.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="tvp-muted">
                      This agency hasn't invited any talent yet — invitations they send will show up
                      here.
                    </td>
                  </tr>
                )}
                {talentInvPage.visible.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.talent_name ?? "—"}</td>
                    <td>{i.email}</td>
                    <td>
                      <span
                        className={statusPillClass(
                          "invitation",
                          effectiveInvitationStatus(i.status, i.expires_at),
                        )}
                      >
                        {statusLabel(
                          "invitation",
                          effectiveInvitationStatus(i.status, i.expires_at),
                        )}
                      </span>
                    </td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>{fmtDate(i.expires_at)}</td>
                    <td>{i.send_count}</td>
                  </tr>
                ))}
                <LoadMoreRow
                  colSpan={6}
                  noun="talent invitations"
                  shown={talentInvPage.shown}
                  total={talentInvPage.total}
                  hasMore={talentInvPage.hasMore}
                  onLoadMore={talentInvPage.loadMore}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {accountState.dialog}
    </>
  );
}
