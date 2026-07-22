import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Plus, Lock, Ban, RotateCcw, Building2, CheckCircle2, Mail, Ban as BanIcon, Link2, RefreshCw, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencies,
  suspendAgency,
  unsuspendAgency,
  resendInvitation,
  revokeInvitation,
  updateInvitationEmail,
  logCopyLink,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { SuspendAgencyDialog } from "@/components/admin/suspend-agency-dialog";

export const Route = createFileRoute("/admin/agencies/")({
  head: () => ({ meta: [{ title: "Agencies · TalVault Admin" }] }),
  component: AgenciesPage,
});

const statusLabel: Record<string, string> = {
  incomplete: "Incomplete",
  invited: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  declined: "Declined",
  suspended: "Suspended",
};
const statusTone: Record<string, string> = {
  incomplete: "purple",
  invited: "blue",
  accepted: "green",
  expired: "amber",
  declined: "red",
  suspended: "teal",
};

function AgenciesPage() {
  const listFn = useServerFn(listAgencies);
  const suspendFn = useServerFn(suspendAgency);
  const unsuspendFn = useServerFn(unsuspendAgency);
  const resendFn = useServerFn(resendInvitation);
  const revokeFn = useServerFn(revokeInvitation);
  const updateEmailFn = useServerFn(updateInvitationEmail);
  const logCopyFn = useServerFn(logCopyLink);
  const qc = useQueryClient();

  const agencies = useQuery({
    queryKey: ["admin", "agencies"],
    queryFn: () => listFn(),
  });

  const suspendM = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      suspendFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency suspended and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to suspend"),
  });
  const unsuspendM = useMutation({
    mutationFn: (id: string) => unsuspendFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency reinstated.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to reinstate"),
  });
  const resendM = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id, extend_days: 14 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation resent · expiry refreshed · logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to resend"),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation revoked and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to revoke"),
  });
  const updateEmailM = useMutation({
    mutationFn: (v: { id: string; email: string }) => updateEmailFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setEditingInvite(null);
      toast.success("Email updated and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update email"),
  });

  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingInvite, setEditingInvite] = useState<{ id: string; email: string; agencyName: string } | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  const list = agencies.data ?? [];
  const visible = useMemo(() => {
    return list.filter((a: any) => {
      if (tab !== "all" && a.status !== tab) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [list, tab, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: list.length,
      incomplete: 0, invited: 0, accepted: 0, expired: 0, declined: 0, suspended: 0,
    };
    for (const a of list) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [list]);

  const exportCsv = () => {
    const headers = ["Agency", "Status", "Contact person", "Contact email", "Country", "Talent", "Created"];
    const rows = visible.map((a: any) => [
      a.name,
      statusLabel[a.status],
      a.contact_person ?? "",
      a.contact_email ?? "",
      a.country ?? "",
      String(a.talent_count),
      new Date(a.created_at).toISOString().slice(0, 10),
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agencies-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const filtersActive = tab !== "all" || !!search;
  const resetFilters = () => { setTab("all"); setSearch(""); };

  const totalCount = counts.all ?? 0;
  const acceptedCount = counts.accepted ?? 0;
  const invitedCount = counts.invited ?? 0;
  const suspendedCount = counts.suspended ?? 0;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agencies</h1>
          <div className="tvp-subtitle">Manage and monitor all agency accounts.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />Export
          </button>
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Plus className="h-4 w-4" />Invite Agency
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="tvp-grid tvp-kpi-grid">
        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => setTab("all")}
        >
          <div className="tvp-kpi-icon tvp-bg-teal"><Building2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{totalCount}</div>
            <div className="tvp-kpi-label">Total Agencies</div>
            <div className="tvp-kpi-sub" style={{ color: totalCount > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {totalCount > 0 ? "Across all statuses" : "None yet"}
            </div>
          </div>
        </button>
        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => setTab("accepted")}
        >
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{acceptedCount}</div>
            <div className="tvp-kpi-label">Accepted</div>
            <div className="tvp-kpi-sub" style={{ color: acceptedCount > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {acceptedCount > 0 ? "Active workspaces" : "No active accounts"}
            </div>
          </div>
        </button>
        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => setTab("invited")}
        >
          <div className="tvp-kpi-icon tvp-bg-amber"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{invitedCount}</div>
            <div className="tvp-kpi-label">Invited</div>
            <div className="tvp-kpi-sub tvp-warn" style={{ color: invitedCount > 0 ? "var(--tvp-amber)" : "var(--tvp-muted)" }}>
              {invitedCount > 0 ? "Awaiting acceptance" : "No outstanding invites"}
            </div>
          </div>
        </button>
        <button
          className="tvp-card tvp-kpi tvp-clickable"
          onClick={() => setTab("suspended")}
        >
          <div className="tvp-kpi-icon tvp-bg-red"><BanIcon className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{suspendedCount}</div>
            <div className="tvp-kpi-label">Suspended</div>
            <div className="tvp-kpi-sub" style={{ color: suspendedCount > 0 ? "var(--tvp-red)" : "var(--tvp-green)" }}>
              {suspendedCount > 0 ? "Read-only / export only" : "None suspended"}
            </div>
          </div>
        </button>
      </div>

      {/* Life chip row */}
      <div className="tvp-life-chips">
        {(["all", "accepted", "invited", "incomplete", "suspended", "expired"] as const).map((k) => (
          <button
            key={k}
            className={`tvp-life-chip${tab === k ? " tvp-active-filter" : ""} tvp-bg-${k === "all" ? "teal" : statusTone[k]}`}
            onClick={() => setTab(k)}
          >
            <div className="tvp-label">{k === "all" ? "All" : statusLabel[k]}</div>
            <div className="tvp-num">{counts[k] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filtersActive && (
            <button className="tvp-link" onClick={resetFilters}>Reset filters</button>
          )}
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th><th>Status</th><th>Contact</th><th>Country</th><th>Talent</th><th>Created</th><th></th>
              </tr>
            </thead>
            <tbody>
              {agencies.isLoading && (
                <tr><td colSpan={7} className="tvp-muted">Loading agencies…</td></tr>
              )}
              {!agencies.isLoading && visible.length === 0 && (
                <tr><td colSpan={7} className="tvp-muted">
                  No agencies to show. <Link to="/admin/invitations/new" className="tvp-link">Invite an agency →</Link>
                </td></tr>
              )}
              {visible.map((a: any) => {
                const invitation = a.invitation;
                const inviteEmail = invitation?.email ?? a.contact_email;
                return (
                  <tr key={a.id}>
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
                      <span className={`tvp-status tvp-${statusTone[a.status]}`}>
                        {statusLabel[a.status]}
                      </span>
                      {a.status === "suspended" && (
                        <span
                          className="tvp-muted"
                          title="Active actions blocked, read-only / export preserved"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, fontSize: 11 }}
                        >
                          <Lock className="h-3 w-3" /> read-only
                        </span>
                      )}
                    </td>
                    <td>{a.contact_person ?? invitation?.contact_person ?? "—"}</td>
                    <td>{a.country ?? "—"}</td>
                    <td>{a.talent_count}</td>
                    <td>
                      {new Date(a.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {a.status === "invited" && invitation ? (
                          <>
                            <button
                              className="tvp-mini-btn"
                              title="Copy invite link (does not extend expiry)"
                              onClick={() => copyInviteLink(invitation)}
                            >
                              <Link2 className="h-4 w-4" />
                            </button>
                            <button
                              className="tvp-mini-btn"
                              title="Correct invite email"
                              onClick={() => {
                                setEditingInvite({ id: invitation.id, email: invitation.email, agencyName: a.name });
                                setEmailDraft(invitation.email);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              className="tvp-mini-btn"
                              title="Resend invite (refreshes expiry)"
                              onClick={() => resendM.mutate(invitation.id)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </>
                        ) : a.status === "invited" && inviteEmail ? (
                          <Link
                            to="/admin/invitations"
                            search={{ email: inviteEmail }}
                            className="tvp-link"
                            title="Find matching invitation"
                            style={{ fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            Manage invite →
                          </Link>
                        ) : null}
                        {a.status === "suspended" ? (
                          <button
                            className="tvp-mini-btn"
                            title="Reinstate agency"
                            onClick={() => unsuspendM.mutate(a.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            className="tvp-mini-btn"
                            title="Suspend agency"
                            onClick={() => doSuspend(a.id, a.name)}
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
          }}
        >
          <div
            className="tvp-card tvp-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(520px, 92vw)" }}
          >
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Correct invitation email</h2>
              <button className="tvp-mini-btn" onClick={() => setEditingInvite(null)}>
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
                disabled={!emailDraft || emailDraft === editingInvite.email || updateEmailM.isPending}
              >
                Save & log
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
