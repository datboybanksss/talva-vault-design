import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, ShieldCheck, UserPlus, X, Pencil } from "lucide-react";
import {
  listAdministrators,
  whoami,
  listAdminInvitations,
  inviteAdministrator,
  revokeAdminInvitation,
  updateAdministrator,
} from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/administrators")({
  head: () => ({ meta: [{ title: "Administrators · TalVault Admin" }] }),
  component: AdminsPage,
});

function AdminsPage() {
  const listFn = useServerFn(listAdministrators);
  const whoamiFn = useServerFn(whoami);
  const listInvFn = useServerFn(listAdminInvitations);
  const inviteFn = useServerFn(inviteAdministrator);
  const revokeFn = useServerFn(revokeAdminInvitation);
  const updateAdminFn = useServerFn(updateAdministrator);
  const qc = useQueryClient();

  const admins = useQuery({
    queryKey: ["admin", "administrators"],
    queryFn: () => listFn(),
  });
  const me = useQuery({
    queryKey: ["whoami"],
    queryFn: () => whoamiFn(),
    refetchOnMount: "always",
    staleTime: 0,
  });
  const invitations = useQuery({
    queryKey: ["admin", "admin-invitations"],
    queryFn: () => listInvFn(),
  });

  const isMain = !!me.data?.isMainAdmin;

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

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerm, setInvitePerm] = useState<"view_only" | "edit">("edit");

  // Per-row edit (Main-admin only)
  const [editAdmin, setEditAdmin] = useState<any | null>(null);
  const [editDesignation, setEditDesignation] = useState("");
  const [editPermission, setEditPermission] = useState<"view_only" | "edit">("edit");

  useEffect(() => {
    if (editAdmin) {
      setEditDesignation(editAdmin.designation ?? "");
      setEditPermission(editAdmin.permission_level ?? "edit");
    }
  }, [editAdmin]);

  const updateAdminMut = useMutation({
    mutationFn: (input: {
      user_id: string;
      designation: string | null;
      permission_level: "view_only" | "edit";
    }) => updateAdminFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "administrators"] });
      qc.invalidateQueries({ queryKey: ["whoami"] });
      toast.success("Administrator updated.");
      setEditAdmin(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update administrator"),
  });

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
          <h1 className="tvp-h1">Administrators</h1>
          <div className="tvp-subtitle">
            Platform administrators and their access levels.
          </div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.total}</div>
            <div className="tvp-kpi-label">Total Administrators</div>
            <div className="tvp-kpi-sub" style={{ color: stats.total > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {stats.total > 0 ? "Active platform seats" : "None yet"}
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.main}</div>
            <div className="tvp-kpi-label">Main Administrators</div>
            <div className="tvp-kpi-sub" style={{ color: stats.main === 1 ? "var(--tvp-green)" : stats.main > 1 ? "var(--tvp-amber)" : "var(--tvp-red)" }}>
              {stats.main === 1 ? "Single owner (recommended)" : stats.main > 1 ? "Multiple owners" : "Missing — assign one"}
            </div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-amber"><UserPlus className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{pendingInvites.length}</div>
            <div className="tvp-kpi-label">Pending Admin Invites</div>
            <div className="tvp-kpi-sub tvp-warn" style={{ color: pendingInvites.length > 0 ? "var(--tvp-amber)" : "var(--tvp-muted)" }}>
              {pendingInvites.length > 0 ? "Awaiting sign-up" : "None outstanding"}
            </div>
          </div>
        </div>
      </div>

      <>

          <div className="tvp-card">
            <div className="tvp-toolbar">
              <h2 className="tvp-h2">Administrators</h2>
            </div>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr>
                    <th>Administrator</th><th>Email</th><th>Designation</th><th>Role</th><th>Access</th><th>Granted</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {admins.isLoading && (
                    <tr><td colSpan={7} className="tvp-muted">Loading…</td></tr>
                  )}
                  {list.map((a: any) => (
                    <tr key={a.user_id}>
                      <td>
                        <strong>{a.display_name || a.email.split("@")[0]}</strong>
                        {a.user_id === me.data?.userId && (
                          <span className="tvp-status tvp-blue" style={{ marginLeft: 8 }}>
                            You
                          </span>
                        )}
                      </td>
                      <td>{a.email}</td>
                      <td className="tvp-muted">{a.designation || "—"}</td>
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
                      <td>
                        {isMain && (
                          <button
                            className="tvp-mini-btn"
                            onClick={() => setEditAdmin(a)}
                            title="Edit designation & permission level"
                            aria-label="Edit administrator"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tvp-card" style={{ marginTop: 16 }}>
            <div className="tvp-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 className="tvp-h2">Administrator invitations</h2>
                <span className="tvp-muted" style={{ fontSize: 12 }}>
                  Sent invites become active when the invitee signs up with the matching email.
                </span>
              </div>
              {isMain && !inviteOpen && (
                <button className="tvp-primary" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-4 w-4" style={{ marginRight: 6 }} />
                  Add
                </button>
              )}
            </div>
            {isMain && inviteOpen && (
              <div
                className="tvp-card tvp-invite-panel"
                style={{ margin: "0 0 16px", background: "var(--tvp-muted-bg, #f8fafc)" }}
              >
                <div className="tvp-panel-head">
                  <h3 className="tvp-h3">New invitation</h3>
                  <button
                    className="tvp-mini-btn"
                    onClick={() => setInviteOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="tvp-muted tvp-invite-desc" style={{ fontSize: 12 }}>
                  The invitee becomes an administrator at the selected permission level as
                  soon as they sign up with this email. This action is recorded in the audit log.
                </p>
                <div className="tvp-invite-form-row">
                  <div className="tvp-form-group">
                    <label>Email address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="new.admin@example.com"
                      autoFocus
                    />
                  </div>
                  <div className="tvp-form-group">
                    <label>Access level</label>
                    <select
                      value={invitePerm}
                      onChange={(e) => setInvitePerm(e.target.value as any)}
                    >
                      <option value="edit">Edit rights — full access</option>
                      <option value="view_only">View only — read-only access</option>
                    </select>
                  </div>
                </div>
                <span className="tvp-muted tvp-invite-hint">
                  {invitePerm === "edit"
                    ? "Can perform all administrator actions (suspend agencies, send invites, approve legal copy, etc.)."
                    : "Can view every admin screen but cannot perform any write action."}
                </span>
                <div className="tvp-footer-actions">
                  <button className="tvp-secondary" onClick={() => setInviteOpen(false)}>
                    Cancel
                  </button>
                  {(() => {
                    const valid = /.+@.+\..+/.test(inviteEmail.trim()) && !!invitePerm;
                    return (
                      <button
                        className="tvp-primary"
                        onClick={() =>
                          invite.mutate({
                            email: inviteEmail.trim(),
                            permission_level: invitePerm,
                          })
                        }
                        disabled={invite.isPending || !valid}
                      >
                        {invite.isPending ? "Sending…" : valid ? "Invite" : "Add"}
                      </button>
                    );
                  })()}
                </div>
              </div>
            )}

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






      {editAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !updateAdminMut.isPending && setEditAdmin(null)}
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
              <h2 className="tvp-h2">
                Edit administrator — {editAdmin.display_name || editAdmin.email}
              </h2>
              <button
                className="tvp-mini-btn"
                onClick={() => setEditAdmin(null)}
                aria-label="Close"
                disabled={updateAdminMut.isPending}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="tvp-muted" style={{ fontSize: 12 }}>
              Only the Main Administrator can change these fields. Every change
              is written to the audit log.
            </p>
            <div className="tvp-form-group">
              <label>Designation / title</label>
              <input
                type="text"
                value={editDesignation}
                onChange={(e) => setEditDesignation(e.target.value)}
                placeholder="e.g. Platform Operations Lead"
                maxLength={120}
              />
            </div>
            <div className="tvp-form-group">
              <label>Permission level</label>
              <select
                value={editPermission}
                onChange={(e) => setEditPermission(e.target.value as any)}
                disabled={editAdmin.is_main_admin}
              >
                <option value="edit">Edit rights — full access</option>
                <option value="view_only">View only — read-only access</option>
              </select>
              {editAdmin.is_main_admin && (
                <span
                  className="tvp-muted"
                  style={{ fontSize: 12, marginTop: 6, display: "block" }}
                >
                  The Main Administrator always keeps edit rights.
                </span>
              )}
            </div>
            <div className="tvp-footer-actions">
              <button
                className="tvp-secondary"
                onClick={() => setEditAdmin(null)}
                disabled={updateAdminMut.isPending}
              >
                Cancel
              </button>
              <button
                className="tvp-primary"
                onClick={() =>
                  updateAdminMut.mutate({
                    user_id: editAdmin.user_id,
                    designation: editDesignation.trim() || null,
                    permission_level: editPermission,
                  })
                }
                disabled={updateAdminMut.isPending}
              >
                {updateAdminMut.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
