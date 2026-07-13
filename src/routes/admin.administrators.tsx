import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, CheckCircle2, ShieldCheck, UserPlus, X } from "lucide-react";
import {
  listAdministrators,
  whoami,
  listLegalCopyItems,
  markLegalCopyApproved,
  listAdminInvitations,
  inviteAdministrator,
  revokeAdminInvitation,
} from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/administrators")({
  head: () => ({ meta: [{ title: "Administrators · TalVault Admin" }] }),
  component: AdminsPage,
});

function AdminsPage() {
  const listFn = useServerFn(listAdministrators);
  const whoamiFn = useServerFn(whoami);
  const listLegalFn = useServerFn(listLegalCopyItems);
  const approveLegalFn = useServerFn(markLegalCopyApproved);
  const listInvFn = useServerFn(listAdminInvitations);
  const inviteFn = useServerFn(inviteAdministrator);
  const revokeFn = useServerFn(revokeAdminInvitation);
  const qc = useQueryClient();

  const admins = useQuery({
    queryKey: ["admin", "administrators"],
    queryFn: () => listFn(),
  });
  const me = useQuery({ queryKey: ["whoami"], queryFn: () => whoamiFn() });
  const legal = useQuery({
    queryKey: ["admin", "legal"],
    queryFn: () => listLegalFn(),
  });
  const invitations = useQuery({
    queryKey: ["admin", "admin-invitations"],
    queryFn: () => listInvFn(),
  });

  const canEdit = !!me.data?.canEdit;
  const isMain = !!me.data?.isMainAdmin;

  const approve = useMutation({
    mutationFn: (id: string) => approveLegalFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Legal / copy item approved.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const invite = useMutation({
    mutationFn: (input: { email: string; permission_level: "view_only" | "edit" }) =>
      inviteFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "admin-invitations"] });
      toast.success("Administrator invitation sent.");
      setInviteOpen(false);
      setInviteEmail("");
      setInvitePerm("edit");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to invite"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "admin-invitations"] });
      toast.success("Invitation revoked.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const [tab, setTab] = useState<"admins" | "legal">("admins");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerm, setInvitePerm] = useState<"view_only" | "edit">("edit");

  const list = admins.data ?? [];
  const stats = useMemo(() => {
    return {
      total: list.length,
      main: list.filter((a: any) => a.is_main_admin).length,
    };
  }, [list]);

  const pendingInvites = (invitations.data ?? []).filter(
    (i: any) => i.status === "pending",
  );

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Administrators & Legal Review</h1>
          <div className="tvp-subtitle">
            Platform administrators and legal / copy review items (bell reminders).
          </div>
        </div>
        {isMain && (
          <button className="tvp-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" style={{ marginRight: 6 }} />
            Invite administrator
          </button>
        )}
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.total}</div>
            <div className="tvp-kpi-label">Total Administrators</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.main}</div>
            <div className="tvp-kpi-label">Main Administrators</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">
              {(legal.data ?? []).filter((l: any) => l.status === "approved").length}
            </div>
            <div className="tvp-kpi-label">Approved Legal / Copy Items</div>
          </div>
        </div>
      </div>

      <div className="tvp-tabs">
        <button
          className={`tvp-tab${tab === "admins" ? " tvp-active" : ""}`}
          onClick={() => setTab("admins")}
        >
          Administrators
        </button>
        <button
          className={`tvp-tab${tab === "legal" ? " tvp-active" : ""}`}
          onClick={() => setTab("legal")}
        >
          Legal & Copy Review
          <span className={`tvp-status tvp-amber`}>
            {(legal.data ?? []).filter((l: any) => l.status !== "approved").length}
          </span>
        </button>
      </div>

      {tab === "admins" && (
        <>
          <div className="tvp-card">
            <div className="tvp-toolbar">
              <h2 className="tvp-h2">Administrators</h2>
            </div>
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Administrator</th><th>Email</th><th>Role</th><th>Access</th><th>Granted</th>
                </tr>
              </thead>
              <tbody>
                {admins.isLoading && (
                  <tr><td colSpan={5} className="tvp-muted">Loading…</td></tr>
                )}
                {list.map((a: any) => (
                  <tr key={a.user_id}>
                    <td>
                      <strong>{a.display_name || a.email.split("@")[0]}</strong>
                      {a.user_id === me.data?.userId && (
                        <span
                          className="tvp-status tvp-blue"
                          style={{ marginLeft: 8, padding: "3px 7px", fontSize: 10 }}
                        >
                          You
                        </span>
                      )}
                    </td>
                    <td>{a.email}</td>
                    <td>
                      <span
                        className={`tvp-status tvp-${a.is_main_admin ? "purple" : "blue"}`}
                      >
                        {a.is_main_admin ? "Main Administrator" : "Administrator"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`tvp-status tvp-${a.permission_level === "edit" ? "green" : "amber"}`}
                      >
                        {a.permission_level === "edit" ? "Edit rights" : "View only"}
                      </span>
                    </td>
                    <td>
                      {new Date(a.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tvp-card" style={{ marginTop: 16 }}>
            <div className="tvp-toolbar">
              <h2 className="tvp-h2">Administrator invitations</h2>
              <span className="tvp-muted" style={{ fontSize: 12 }}>
                Sent invites become active when the invitee signs up with the matching email.
              </span>
            </div>
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Email</th><th>Access</th><th>Status</th><th>Expires</th><th>Invited by</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(invitations.data ?? []).length === 0 && !invitations.isLoading && (
                  <tr><td colSpan={6} className="tvp-muted">No invitations sent yet.</td></tr>
                )}
                {(invitations.data ?? []).map((i: any) => (
                  <tr key={i.id}>
                    <td><strong>{i.email}</strong></td>
                    <td>
                      <span
                        className={`tvp-status tvp-${i.permission_level === "edit" ? "green" : "amber"}`}
                      >
                        {i.permission_level === "edit" ? "Edit rights" : "View only"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`tvp-status tvp-${
                          i.status === "accepted" ? "green" :
                          i.status === "pending" ? "blue" :
                          i.status === "revoked" ? "red" : "amber"
                        }`}
                      >
                        {i.status}
                      </span>
                    </td>
                    <td>
                      {new Date(i.expires_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="tvp-muted">{i.invited_by_email ?? "—"}</td>
                    <td>
                      {isMain && i.status === "pending" && (
                        <button
                          className="tvp-secondary"
                          onClick={() => revoke.mutate(i.id)}
                          disabled={revoke.isPending}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}


      {tab === "legal" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Legal & Copy Review</h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              T&Cs, disclaimers and system copy. Placeholder items appear in the bell until approved.
            </span>
          </div>
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Item</th><th>Status</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(legal.data ?? []).length === 0 && !legal.isLoading && (
                <tr><td colSpan={4} className="tvp-muted">No legal / copy items configured yet.</td></tr>
              )}
              {(legal.data ?? []).map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.title}</strong>
                    {l.body && (
                      <>
                        <br />
                        <span className="tvp-muted" style={{ fontSize: 12 }}>{l.body}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <span
                      className={`tvp-status tvp-${
                        l.status === "approved"
                          ? "green"
                          : l.status === "in_review"
                            ? "amber"
                            : "red"
                      }`}
                    >
                      {l.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    {new Date(l.updated_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td>
                    {l.status !== "approved" && canEdit && (
                      <button
                        className="tvp-secondary"
                        onClick={() => approve.mutate(l.id)}
                        disabled={approve.isPending}
                      >
                        Mark approved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <div
          className="tvp-modal-backdrop"
          onClick={() => setInviteOpen(false)}
        >
          <div
            className="tvp-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="tvp-modal-head">
              <h3 className="tvp-h2">Invite administrator</h3>
              <button
                className="tvp-icon-btn"
                onClick={() => setInviteOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="tvp-modal-body">
              <label className="tvp-field">
                <span className="tvp-field-label">Email address</span>
                <input
                  type="email"
                  className="tvp-input"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="new.admin@example.com"
                  autoFocus
                />
              </label>
              <label className="tvp-field">
                <span className="tvp-field-label">Permission level</span>
                <select
                  className="tvp-input"
                  value={invitePerm}
                  onChange={(e) => setInvitePerm(e.target.value as any)}
                >
                  <option value="edit">Edit rights — full access</option>
                  <option value="view_only">View only — read-only access</option>
                </select>
                <span className="tvp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {invitePerm === "edit"
                    ? "Can perform all administrator actions (suspend agencies, send invites, approve legal copy, etc.)."
                    : "Can view every admin screen but cannot perform any write action."}
                </span>
              </label>
            </div>
            <div className="tvp-modal-foot">
              <button className="tvp-secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </button>
              <button
                className="tvp-primary"
                onClick={() =>
                  invite.mutate({
                    email: inviteEmail.trim(),
                    permission_level: invitePerm,
                  })
                }
                disabled={invite.isPending || !/.+@.+\..+/.test(inviteEmail.trim())}
              >
                {invite.isPending ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
