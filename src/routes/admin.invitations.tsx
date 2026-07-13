import { createFileRoute, Link } from "@tanstack/react-router";
import { Send, Link2, RefreshCw, Ban, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyInvitations,
  resendInvitation,
  revokeInvitation,
  updateInvitationEmail,
  logCopyLink,
} from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invitations")({
  head: () => ({ meta: [{ title: "Agency Invitations · TalVault Admin" }] }),
  component: InvitationsPage,
});

const statusLabel: Record<string, string> = {
  pending: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  declined: "Declined",
  revoked: "Revoked",
};
const statusTone: Record<string, string> = {
  pending: "blue",
  accepted: "green",
  expired: "red",
  declined: "neutral",
  revoked: "neutral",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}
function daysBetween(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function InvitationsPage() {
  const listFn = useServerFn(listAgencyInvitations);
  const resendFn = useServerFn(resendInvitation);
  const revokeFn = useServerFn(revokeInvitation);
  const updateEmailFn = useServerFn(updateInvitationEmail);
  const logCopyFn = useServerFn(logCopyLink);
  const qc = useQueryClient();

  const invites = useQuery({
    queryKey: ["admin", "invitations"],
    queryFn: () => listFn(),
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
    mutationFn: (v: { id: string; email: string }) =>
      updateEmailFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setEditing(null);
      toast.success("Email updated and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update email"),
  });

  const [tab, setTab] = useState<string>("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  const list = invites.data ?? [];
  const visible = useMemo(
    () => (tab === "all" ? list : list.filter((i: any) => i.status === tab)),
    [list, tab],
  );

  const copyLink = async (inv: any) => {
    const url = `${window.location.origin}/invite/${inv.token}`;
    try {
      await navigator.clipboard.writeText(url);
      await logCopyFn({ data: { id: inv.id } });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      toast.success("Link copied. Copy does not extend expiry.");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agency Invitations</h1>
          <div className="tvp-subtitle">
            Unique link per recipient. Copy never extends expiry. All actions are audit logged.
          </div>
        </div>
        <div className="tvp-actions">
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Send className="h-4 w-4" />New Invitation
          </Link>
        </div>
      </div>

      <div className="tvp-tabs">
        {["all", "pending", "accepted", "expired", "declined", "revoked"].map((k) => (
          <button
            key={k}
            className={`tvp-tab${tab === k ? " tvp-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {k === "all" ? "All" : statusLabel[k]}
            <span
              className={`tvp-status tvp-${k === "all" ? "neutral" : statusTone[k]}`}
            >
              {k === "all"
                ? list.length
                : list.filter((i: any) => i.status === k).length}
            </span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th>
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
                <tr><td colSpan={7} className="tvp-muted">Loading…</td></tr>
              )}
              {!invites.isLoading && visible.length === 0 && (
                <tr><td colSpan={7} className="tvp-muted">
                  No invitations to show. <Link to="/admin/invitations/new" className="tvp-link">Send one →</Link>
                </td></tr>
              )}
              {visible.map((i: any) => {
                const dLeft = daysBetween(i.expires_at);
                const expiryTone =
                  i.status === "pending" && dLeft < 0
                    ? "red"
                    : i.status === "pending" && dLeft <= 3
                      ? "amber"
                      : "neutral";
                const expiryLabel =
                  i.status !== "pending"
                    ? "—"
                    : dLeft < 0
                      ? "Expired"
                      : `${dLeft} day${dLeft === 1 ? "" : "s"}`;
                const readOnly = i.status !== "pending";
                return (
                  <tr key={i.id}>
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
                      <span className={`tvp-status tvp-${statusTone[i.status]}`}>
                        {statusLabel[i.status]}
                      </span>
                    </td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>
                      <span className={`tvp-status tvp-${expiryTone}`}>{expiryLabel}</span>
                    </td>
                    <td>{i.send_count}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="tvp-mini-btn"
                          title="Copy invite link (does not extend expiry)"
                          onClick={() => copyLink(i)}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                        {!readOnly && (
                          <button
                            className="tvp-mini-btn"
                            title="Edit email (only before acceptance)"
                            onClick={() => {
                              setEditing(i);
                              setEmailDraft(i.email);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {i.status === "pending" && (
                          <>
                            <button
                              className="tvp-mini-btn"
                              title="Resend (logs new send, refreshes expiry)"
                              onClick={() => resendM.mutate(i.id)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              className="tvp-mini-btn"
                              title="Revoke invitation"
                              onClick={() => {
                                if (confirm(`Revoke invitation to ${i.agency_name}?`))
                                  revokeM.mutate(i.id);
                              }}
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </>
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

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEditing(null)}
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
              <h2 className="tvp-h2">Edit invitation email</h2>
              <button className="tvp-mini-btn" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="tvp-muted" style={{ fontSize: 12 }}>
              Editing is only allowed before acceptance. After acceptance, updates go through account settings.
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
              <button className="tvp-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="tvp-primary"
                onClick={() =>
                  updateEmailM.mutate({ id: editing.id, email: emailDraft })
                }
                disabled={
                  !emailDraft || emailDraft === editing.email || updateEmailM.isPending
                }
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
