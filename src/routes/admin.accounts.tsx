import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { statusLabel, statusPillClass, statusToken } from "@/lib/status-labels";
import { effectiveInvitationStatus } from "@/lib/invitation-status";
import { agencyActions, invitationActions } from "@/lib/status-actions";
import {
  Download,
  Plus,
  Lock,
  Ban,
  RotateCcw,
  Building2,
  CheckCircle2,
  Mail,
  Ban as BanIcon,
  Link2,
  RefreshCw,
  Pencil,
  X,
  Trash2,
  FileEdit,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAccounts,
  suspendAgency,
  unsuspendAgency,
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
import { SuspendAgencyDialog } from "@/components/admin/suspend-agency-dialog";
import { PAGE_SIZE } from "@/lib/pagination";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  TALENT_LINK_FILTERS,
  accountStatusLabel,
  accountStatusOptionLabel,
  accountStatusPill,
  normaliseAccountStatus,
  normaliseAccountType,
  normaliseTalentLink,
  type AccountType,
} from "@/lib/account-filters";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { LoadMoreRow } from "@/components/shared/load-more";
import { FilterBar } from "@/components/shared/filter-bar";
import { friendlyError } from "@/lib/friendly-error";

type AccountsSearch = { type?: string; status?: string; link?: string };
const DESC = "Agencies and talent in one list, with status, linked agency and actions.";

export const Route = createFileRoute("/admin/accounts")({
  validateSearch: (raw: Record<string, unknown>): AccountsSearch => ({
    ...(normaliseAccountType(raw.type) !== "all" ? { type: String(raw.type) } : {}),
    ...(normaliseAccountStatus(raw.status) !== "all" ? { status: String(raw.status) } : {}),
    ...(normaliseTalentLink(raw.link) !== "all" ? { link: String(raw.link) } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Accounts · TalVault Admin" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Accounts · TalVault Admin" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const listFn = useServerFn(listAccounts);
  const suspendFn = useServerFn(suspendAgency);
  const unsuspendFn = useServerFn(unsuspendAgency);
  const resendFn = useServerFn(resendInvitation);
  const sendAgencyEmailFn = useServerFn(sendAgencyInvitationEmail);
  const revokeFn = useServerFn(revokeInvitation);
  const updateEmailFn = useServerFn(updateInvitationEmail);
  const logCopyFn = useServerFn(logCopyLink);
  const deleteFn = useServerFn(deleteAgencyInvitation);
  const nav = useNavigate();
  const qc = useQueryClient();

  const search = Route.useSearch();
  const type = normaliseAccountType(search.type);
  const status = normaliseAccountStatus(search.status);
  const link = type === "talent" ? normaliseTalentLink(search.link) : "all";
  const setFilters = (next: AccountsSearch) =>
    nav({
      to: "/admin/accounts",
      search: (prev: AccountsSearch) => {
        const m = { ...prev, ...next };
        const out: AccountsSearch = {};
        if (m.type && m.type !== "all") out.type = m.type;
        if (m.status && m.status !== "all") out.status = m.status;
        if (out.type === "talent" && m.link && m.link !== "all") out.link = m.link;
        return out;
      },
      replace: true,
    });
  const clearFilters = () => nav({ to: "/admin/accounts", search: {}, replace: true });

  const accounts = useInfiniteQuery({
    queryKey: ["admin", "accounts", type, status, link],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listFn({ data: { type, status, link, limit: PAGE_SIZE, offset: pageParam as number } }),
    getNextPageParam: (last: any, all: any[]) => {
      const loaded = all.reduce((n, p: any) => n + (p.rows?.length ?? 0), 0);
      return loaded < (last?.total ?? 0) ? loaded : undefined;
    },
  });
  const visible = useMemo(
    () => (accounts.data?.pages ?? []).flatMap((p: any) => p.rows ?? []),
    [accounts.data?.pages],
  );
  const firstPage: any = accounts.data?.pages?.[0];
  const total = firstPage?.total ?? 0;
  const counts = firstPage?.counts ?? { type: {}, status: {}, link: {} };

  const suspendM = useMutation({
    mutationFn: (v: { id: string; reason: string }) => suspendFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency suspended and logged.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to suspend")),
  });
  const unsuspendM = useMutation({
    mutationFn: (id: string) => unsuspendFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency reinstated.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to reinstate")),
  });
  const resendM = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id, extend_days: 14 } }),
    onSuccess: async (inv: any) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      // Expiry is refreshed regardless; only claim the email went out if it did.
      const res: any = await sendAgencyEmailFn({
        data: {
          id: inv.id,
          subject: DEFAULT_INVITATION_SUBJECT,
          body: DEFAULT_INVITATION_BODY,
          invite_url: `${window.location.origin}/invite/${inv.token}`,
        },
      }).catch(() => ({ sent: false }));
      if (res?.sent) toast.success("Invitation resent · expiry refreshed · logged.");
      else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to resend")),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation revoked and logged.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to revoke")),
  });
  const updateEmailM = useMutation({
    mutationFn: (v: { id: string; email: string }) => updateEmailFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setEditingInvite(null);
      toast.success("Email updated and logged.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to update email")),
  });
  const [pendingDelete, setPendingDelete] = useState<{
    inviteId: string;
    agencyName: string;
    email: string;
  } | null>(null);
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setPendingDelete(null);
      toast.success(
        res?.agency_deleted ? "Invitation and agency shell deleted." : "Invitation deleted.",
      );
    },
    onError: (e: any) => toast.error(friendlyError(e, "Failed to delete")),
  });

  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingInvite, setEditingInvite] = useState<{
    id: string;
    email: string;
    agencyName: string;
  } | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  const exportCsv = () => {
    const headers = ["Name", "Type", "Status", "Email", "Linked agency", "Joined"];
    const rows = visible.map((a: any) => [
      a.name,
      ACCOUNT_TYPE_LABEL[a.type as AccountType],
      accountStatusLabel(a.type, a.status),
      (a.type === "agency" ? a.contact_email : a.email) ?? "",
      a.type === "talent" ? linkedLabel(a) : "",
      new Date(a.joined_at).toISOString().slice(0, 10),
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounts-${type}-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doSuspend = (id: string, name: string) => {
    setSuspendTarget({ id, name });
  };

  const copyInviteLink = async (invitation: any) => {
    if (!invitation?.token) {
      toast.error("No invitation link found for this agency.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${invitation.token}`);
      await logCopyFn({ data: { id: invitation.id } });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      toast.success("Link copied. Copy does not extend expiry.");
    } catch {
      toast.error("Copy failed");
    }
  };

  const filtersActive = type !== "all" || status !== "all" || link !== "all";
  const activeFilterText = [
    type !== "all" ? `Type: ${ACCOUNT_TYPE_LABEL[type]}` : null,
    status !== "all" ? `Status: ${accountStatusOptionLabel(status)}` : null,
    link !== "all" ? (link === "linked" ? "Agency-linked" : "Independent") : null,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Accounts</h1>
          <div className="tvp-subtitle">Agency and talent accounts across TalVault.</div>
        </div>
        <div className="tvp-actions" data-tour="admin-agency-actions">
          <button className="tvp-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export
          </button>
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Plus className="h-4 w-4" />
            New invitation
          </Link>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <FilterBar
          tourId="admin-account-filters"
          active={filtersActive}
          onClear={clearFilters}
          onChange={(key, value) => setFilters({ [key]: value } as AccountsSearch)}
          filters={[
            {
              key: "type",
              label: "Type",
              value: type,
              options: (["all", ...ACCOUNT_TYPES] as const).map((t) => ({
                value: t,
                label: t === "all" ? "All types" : ACCOUNT_TYPE_LABEL[t],
                count: counts.type[t] ?? 0,
              })),
            },
            {
              key: "status",
              label: "Status",
              value: status,
              options: ["all", ...ACCOUNT_STATUSES].map((st) => ({
                value: st,
                label: st === "all" ? "All statuses" : accountStatusOptionLabel(st),
                count: counts.status[st] ?? 0,
              })),
            },
            ...(type === "talent"
              ? [
                  {
                    key: "link",
                    label: "Agency link",
                    value: link,
                    options: (["all", ...TALENT_LINK_FILTERS] as const).map((l) => ({
                      value: l,
                      label:
                        l === "all" ? "All talent" : l === "linked" ? "Agency-linked" : "Independent",
                      count: counts.link[l] ?? 0,
                    })),
                  },
                ]
              : []),
          ]}
        />
        <div className="tvp-table-wrap">
          <table className="tvp-table" data-tour="admin-agency-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Linked agency</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.isLoading && (
                <tr>
                  <td colSpan={6} className="tvp-muted">
                    Loading accounts…
                  </td>
                </tr>
              )}
              {!accounts.isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="tvp-muted">
                    {filtersActive ? (
                      <>
                        No accounts match {activeFilterText}.{" "}
                        <button type="button" className="tvp-link" onClick={clearFilters}>
                          Clear filters
                        </button>
                      </>
                    ) : (
                      <>
                        No accounts yet — the first one starts with an invitation.{" "}
                        <Link to="/admin/invitations/new" className="tvp-link">
                          New invitation
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {visible.map((a: any) => {
                if (a.type === "talent") {
                  return (
                    <tr key={a.key}>
                      <td>
                        <strong>{a.name}</strong>
                        {a.email && (
                          <>
                            <br />
                            <span className="tvp-muted">{a.email}</span>
                          </>
                        )}
                      </td>
                      <td>
                        <span className="tvp-status st-neutral">Talent</span>
                      </td>
                      <td>
                        <span className={accountStatusPill("talent", a.status)}>
                          {accountStatusLabel("talent", a.status)}
                        </span>
                      </td>
                      <td>{linkedLabel(a)}</td>
                      <td>{fmtDate(a.joined_at)}</td>
                      <td></td>
                    </tr>
                  );
                }
                const invitation = a.invitation;
                const inviteEmail = invitation?.email ?? a.contact_email;
                const isDraftInvite =
                  a.status === "invited" && !!invitation && invitation.status === "draft";
                const isSentInvite =
                  a.status === "invited" && !!invitation && invitation.status !== "draft";
                const invAllowed = invitation
                  ? invitationActions({
                      status: effectiveInvitationStatus(invitation.status, invitation.expires_at),
                      storedStatus: invitation.status,
                      viewer: "admin",
                      canWrite: true,
                    })
                  : [];
                const agencyAllowed = agencyActions({ status: a.status, canEdit: true });
                const inviteOpen = isSentInvite && invAllowed.includes("resend");
                return (
                  <tr key={a.key}>
                    <td>
                      <Link to="/admin/agencies/$id" params={{ id: a.id }}>
                        <strong>{a.name}</strong>
                      </Link>
                      {inviteEmail && (
                        <>
                          <br />
                          <span className="tvp-muted">{inviteEmail}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className="tvp-status st-neutral">Agency</span>
                    </td>
                    <td>
                      <span className={statusPillClass("agency", a.status)}>
                        {statusLabel("agency", a.status)}
                      </span>
                      {a.status === "suspended" && (
                        <span
                          className="tvp-muted"
                          title="Active actions blocked, read-only / export preserved"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            marginLeft: 6,
                            fontSize: 11,
                          }}
                        >
                          <Lock className="h-3 w-3" /> read-only
                        </span>
                      )}
                    </td>
                    <td className="tvp-muted">—</td>
                    <td>{fmtDate(a.joined_at)}</td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        {a.status === "invited" && !invitation && inviteEmail && (
                          <Link
                            to="/admin/invitations"
                            search={{ email: inviteEmail }}
                            className="tvp-link"
                            title="Find matching invitation"
                            style={{ fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            Manage invite →
                          </Link>
                        )}
                        <RowActionsMenu
                          actions={[
                            isDraftInvite && {
                              key: "continue",
                              label: "Continue draft",
                              icon: FileEdit,
                              onSelect: () =>
                                nav({
                                  to: "/admin/invitations/new",
                                  search: { draft: invitation!.id } as any,
                                }),
                            },
                            isSentInvite && {
                              key: "preview",
                              label: "Preview branded email",
                              icon: Mail,
                              to: "/admin/invitations/$id/email-preview",
                              params: { id: invitation?.id ?? "" },
                            },
                            inviteOpen && {
                              key: "copy",
                              label: "Copy invite link",
                              icon: Link2,
                              title: "Copying does not extend expiry",
                              onSelect: () => copyInviteLink(invitation!),
                            },
                            inviteOpen && {
                              key: "edit",
                              label: "Correct invite email",
                              icon: Pencil,
                              onSelect: () => {
                                setEditingInvite({
                                  id: invitation!.id,
                                  email: invitation!.email,
                                  agencyName: a.name,
                                });
                                setEmailDraft(invitation!.email);
                              },
                            },
                            inviteOpen && {
                              key: "resend",
                              label: "Resend invite",
                              icon: RefreshCw,
                              title: "Refreshes the expiry date",
                              onSelect: () => resendM.mutate(invitation!.id),
                            },
                            isSentInvite &&
                              invAllowed.includes("reinvite") && {
                                key: "reinvite",
                                label: "Reinvite",
                                icon: Send,
                                onSelect: () =>
                                  invitation!.status === "pending"
                                    ? resendM.mutate(invitation!.id)
                                    : nav({
                                        to: "/admin/invitations/new",
                                        search: { type: "agency" },
                                      }),
                              },
                            agencyAllowed.includes("reinstate")
                              ? {
                                  key: "reinstate",
                                  label: "Reinstate agency",
                                  icon: RotateCcw,
                                  separatorBefore: true,
                                  onSelect: () => unsuspendM.mutate(a.id),
                                }
                              : {
                                  key: "suspend",
                                  label: "Suspend agency",
                                  icon: Ban,
                                  destructive: true,
                                  separatorBefore: true,
                                  onSelect: () => doSuspend(a.id, a.name),
                                },
                            inviteOpen && {
                              key: "revoke",
                              label: "Revoke invitation",
                              icon: Ban,
                              destructive: true,
                              onSelect: () => {
                                if (confirm(`Revoke invitation to ${a.name}?`))
                                  revokeM.mutate(invitation!.id);
                              },
                            },
                            (isDraftInvite || isSentInvite) && {
                              key: "delete",
                              label: isDraftInvite ? "Delete draft" : "Delete invitation",
                              icon: Trash2,
                              destructive: true,
                              title: isDraftInvite
                                ? "Removes compliance documents and the agency shell"
                                : "Removes the shell agency if it has no members",
                              onSelect: () =>
                                setPendingDelete({
                                  inviteId: invitation!.id,
                                  agencyName: a.name,
                                  email: invitation!.email,
                                }),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              <LoadMoreRow
                colSpan={6}
                noun="accounts"
                shown={visible.length}
                total={total}
                hasMore={!!accounts.hasNextPage}
                loading={accounts.isFetchingNextPage}
                onLoadMore={() => accounts.fetchNextPage()}
              />
            </tbody>
          </table>
        </div>
      </div>

      {suspendTarget && (
        <SuspendAgencyDialog
          agencyName={suspendTarget.name}
          isPending={suspendM.isPending}
          onCancel={() => setSuspendTarget(null)}
          onConfirm={(reason) => {
            suspendM.mutate(
              { id: suspendTarget.id, reason },
              { onSuccess: () => setSuspendTarget(null) },
            );
          }}
        />
      )}

      {editingInvite && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingInvite(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            className="tvp-card tvp-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(520px, 92vw)" }}
          >
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Correct invitation email</h2>
              <button title="Close" className="tvp-mini-btn" onClick={() => setEditingInvite(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="tvp-muted" style={{ fontSize: 12 }}>
              {editingInvite.agencyName} has not accepted yet. Updating this email is audit logged.
            </p>
            <div className="tvp-form-group">
              <label>Recipient email</label>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
              />
            </div>
            <div className="tvp-footer-actions">
              <button className="tvp-secondary" onClick={() => setEditingInvite(null)}>
                Cancel
              </button>
              <button
                className="tvp-primary"
                onClick={() => updateEmailM.mutate({ id: editingInvite.id, email: emailDraft })}
                disabled={
                  !emailDraft || emailDraft === editingInvite.email || updateEmailM.isPending
                }
              >
                Save & log
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingDelete(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            className="tvp-card tvp-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(520px, 92vw)" }}
          >
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Delete invitation permanently?</h2>
              <button title="Close" className="tvp-mini-btn" onClick={() => setPendingDelete(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>
              This permanently removes the invitation to <strong>{pendingDelete.agencyName}</strong>{" "}
              (<span className="tvp-muted">{pendingDelete.email}</span>), deletes any uploaded
              compliance documents, and — if the agency shell has no members yet — removes the
              agency record too. This cannot be undone.
            </p>
            <p className="tvp-muted" style={{ fontSize: 12, marginTop: 8 }}>
              Prefer <strong>Revoke</strong> if you need to keep an audit trail of a cancelled
              invite.
            </p>
            <div className="tvp-footer-actions">
              <button className="tvp-secondary" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="tvp-primary"
                style={{ background: "var(--tvp-red)", borderColor: "var(--tvp-red)" }}
                onClick={() => deleteM.mutate(pendingDelete.inviteId)}
                disabled={deleteM.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deleteM.isPending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function linkedLabel(a: { linked_agencies?: string[] }) {
  return a.linked_agencies && a.linked_agencies.length > 0
    ? a.linked_agencies.join(", ")
    : "Independent";
}
