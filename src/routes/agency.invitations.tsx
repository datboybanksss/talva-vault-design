import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, RefreshCw, Ban, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  agencyWhoami,
  listAgencyInvitationsMine,
  createTalentInvitationMine,
  createStaffInvitationMine,
  resendAgencyInvitationMine,
  revokeAgencyInvitationMine,
  logAgencyCopyLinkMine,
} from "@/lib/agency.functions";

export const Route = createFileRoute("/agency/invitations")({
  head: () => ({ meta: [{ title: "Invitations · TalVault Agency" }] }),
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
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

type InviteType = "talent" | "staff";

function InvitationsPage() {
  const listFn = useServerFn(listAgencyInvitationsMine);
  const whoamiFn = useServerFn(agencyWhoami);
  const createTalent = useServerFn(createTalentInvitationMine);
  const createStaff = useServerFn(createStaffInvitationMine);
  const resendFn = useServerFn(resendAgencyInvitationMine);
  const revokeFn = useServerFn(revokeAgencyInvitationMine);
  const logCopyFn = useServerFn(logAgencyCopyLinkMine);
  const qc = useQueryClient();

  const who = useQuery({ queryKey: ["agency", "whoami"], queryFn: () => whoamiFn() });
  const invites = useQuery({
    queryKey: ["agency", "invitations"],
    queryFn: () => listFn(),
  });

  const [tab, setTab] = useState<"all" | "talent" | "staff" | "expired" | "revoked">("all");
  const [openForm, setOpenForm] = useState<InviteType | null>(null);

  const isOwner = who.data?.role === "owner";
  const list = invites.data ?? [];
  const visible = useMemo(() => {
    switch (tab) {
      case "all": return list;
      case "talent": return list.filter((i: any) => i.type === "talent");
      case "staff": return list.filter((i: any) => i.type === "staff");
      case "expired": return list.filter((i: any) => i.status === "expired");
      case "revoked": return list.filter((i: any) => i.status === "revoked");
    }
  }, [list, tab]);

  const counts = useMemo(
    () => ({
      all: list.length,
      talent: list.filter((i: any) => i.type === "talent").length,
      staff: list.filter((i: any) => i.type === "staff").length,
      expired: list.filter((i: any) => i.status === "expired").length,
      revoked: list.filter((i: any) => i.status === "revoked").length,
    }),
    [list],
  );

  const resendM = useMutation({
    mutationFn: (v: { id: string; type: InviteType }) =>
      resendFn({ data: { id: v.id, type: v.type, extend_days: 14 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "invitations"] });
      toast.success("Invitation resent · expiry refreshed · logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to resend"),
  });
  const revokeM = useMutation({
    mutationFn: (v: { id: string; type: InviteType }) => revokeFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "invitations"] });
      toast.success("Invitation revoked and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to revoke"),
  });

  const copyLink = async (inv: any) => {
    const url = `${window.location.origin}/invite/${inv.token}`;
    try {
      await navigator.clipboard.writeText(url);
      await logCopyFn({ data: { id: inv.id, type: inv.type } });
      toast.success("Link copied. Copy does not extend expiry.");
    } catch {
      toast.error("Copy failed");
    }
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
        <div className="tvp-actions">
          <button
            className="tvp-secondary"
            disabled={!isOwner}
            title={isOwner ? "Invite an agency staff member" : "Only the agency owner can invite staff."}
            onClick={() => setOpenForm("staff")}
          >
            <Send className="h-4 w-4" />Invite Staff
          </button>
          <button
            className="tvp-primary"
            disabled={!isOwner}
            title={isOwner ? "Invite talent to your agency" : "Only the agency owner can invite talent."}
            onClick={() => setOpenForm("talent")}
          >
            <Send className="h-4 w-4" />Invite Talent
          </button>
        </div>
      </div>

      <div className="tvp-tabs">
        {(["all", "talent", "staff", "expired", "revoked"] as const).map((k) => (
          <button
            key={k}
            className={`tvp-tab${tab === k ? " tvp-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {k[0].toUpperCase() + k.slice(1)}
            <span className="tvp-status tvp-neutral">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Email</th>
                <th>Type</th>
                <th>Status</th>
                <th>Sent By</th>
                <th>Sent</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.isLoading && (
                <tr><td colSpan={8} className="tvp-muted">Loading…</td></tr>
              )}
              {!invites.isLoading && visible.length === 0 && (
                <tr><td colSpan={8} className="tvp-muted">No invitations to show.</td></tr>
              )}
              {visible.map((i: any) => {
                const dLeft = daysBetween(i.expires_at);
                const expiryTone =
                  i.status === "pending" && dLeft < 0 ? "red"
                    : i.status === "pending" && dLeft <= 3 ? "amber"
                      : "neutral";
                const expiryLabel =
                  i.status !== "pending" ? "—"
                    : dLeft < 0 ? "Expired"
                      : `${dLeft} day${dLeft === 1 ? "" : "s"}`;
                return (
                  <tr key={`${i.type}-${i.id}`}>
                    <td><strong>{i.recipient_name ?? "—"}</strong></td>
                    <td>{i.email}</td>
                    <td>
                      <span className={`tvp-status tvp-${i.type === "talent" ? "blue" : "teal"}`}>
                        {i.type === "talent" ? "Talent Invite" : "Staff Invite"}
                      </span>
                    </td>
                    <td>
                      <span className={`tvp-status tvp-${statusTone[i.status] ?? "neutral"}`}>
                        {statusLabel[i.status] ?? i.status}
                      </span>
                    </td>
                    <td>{i.invited_by_label}</td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>
                      <span className={`tvp-status tvp-${expiryTone}`}>{expiryLabel}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="tvp-mini-btn"
                          title="Copy invite link (does not extend expiry)"
                          onClick={() => copyLink(i)}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                        {i.status === "pending" && isOwner && (
                          <>
                            <button
                              className="tvp-mini-btn"
                              title="Resend (refreshes expiry, logs new send)"
                              onClick={() => resendM.mutate({ id: i.id, type: i.type })}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              className="tvp-mini-btn"
                              title="Revoke invitation"
                              onClick={() => {
                                if (confirm(`Revoke invitation to ${i.email}?`))
                                  revokeM.mutate({ id: i.id, type: i.type });
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

      {openForm && (
        <NewInvitationModal
          type={openForm}
          onClose={() => setOpenForm(null)}
          onSubmit={async (payload) => {
            try {
              if (openForm === "talent") {
                await createTalent({ data: payload as any });
                toast.success("Talent invitation sent.");
              } else {
                await createStaff({ data: payload as any });
                toast.success("Staff invitation sent.");
              }
              qc.invalidateQueries({ queryKey: ["agency", "invitations"] });
              setOpenForm(null);
            } catch (e: any) {
              toast.error(e.message ?? "Failed to send invitation");
            }
          }}
        />
      )}
    </>
  );
}

function NewInvitationModal({
  type, onClose, onSubmit,
}: {
  type: InviteType;
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [expiryDays, setExpiryDays] = useState(14);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    email.trim() &&
    (type === "staff" ? true : name.trim()) &&
    !busy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div
        className="tvp-card tvp-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 92vw)" }}
      >
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">
            {type === "talent" ? "New Talent Invitation" : "New Staff Invitation"}
          </h2>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="tvp-muted" style={{ fontSize: 12 }}>
          {type === "talent"
            ? "Invites a talent to join your agency's shared workspace. A unique secure link is generated per recipient."
            : "Invites a staff member to your agency. Only agency owners can send staff invitations."}
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canSubmit) return;
            setBusy(true);
            const payload =
              type === "talent"
                ? { talent_name: name.trim(), email: email.trim(), expiry_days: expiryDays }
                : { contact_person: name.trim() || undefined, email: email.trim(), role, expiry_days: expiryDays };
            await onSubmit(payload);
            setBusy(false);
          }}
        >
          {type === "talent" ? (
            <div className="tvp-form-group">
              <label>Talent name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Lara Maseko" />
            </div>
          ) : (
            <div className="tvp-form-group">
              <label>Contact person</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sipho Dlamini" />
            </div>
          )}
          <div className="tvp-form-group">
            <label>Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
          </div>
          {type === "staff" && (
            <div className="tvp-form-group">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          )}
          <div className="tvp-form-group">
            <label>Invitation expiry (days)</label>
            <input
              type="number" min={1} max={60} value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value) || 14)}
            />
          </div>
          <div className="tvp-footer-actions">
            <button type="button" className="tvp-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="tvp-primary" disabled={!canSubmit}>
              {busy ? "Sending…" : "Create & send invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
