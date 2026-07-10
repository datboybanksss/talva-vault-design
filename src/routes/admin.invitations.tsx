import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Send, Info, Link2, RefreshCw, Ban, Pencil, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/admin/invitations")({
  head: () => ({ meta: [{ title: "Agency Invitations · TalVault Admin" }] }),
  component: InvitationsPage,
});

type Status = "Invited" | "Accepted" | "Expired" | "Declined" | "Revoked";

type Invite = {
  agency: string;
  code: string;
  contact: string;
  email: string;
  sentBy: string;
  sentDate: string;
  expires: { label: string; tone: string };
  status: Status;
  tone: string;
  linkToken: string;
};

const seed: Invite[] = [
  { agency: "NewTech Solutions", code: "AG-1028", contact: "Maya Johnson", email: "maya.j@newtechsol.com", sentBy: "Thandi M.", sentDate: "20 May 2026", expires: { label: "3 days", tone: "amber" }, status: "Invited", tone: "blue", linkToken: "inv_ag1028_a91f" },
  { agency: "Indigo Group", code: "AG-0974", contact: "Liam Carter", email: "liam.c@indigogroup.com", sentBy: "Israel N.", sentDate: "18 May 2026", expires: { label: "1 day", tone: "amber" }, status: "Invited", tone: "blue", linkToken: "inv_ag0974_b3c7" },
  { agency: "Pinnacle Advisors", code: "AG-0931", contact: "Sarah Williams", email: "sarah.w@pinnacleadvisors.com", sentBy: "Thandi M.", sentDate: "15 May 2026", expires: { label: "—", tone: "neutral" }, status: "Accepted", tone: "green", linkToken: "inv_ag0931_d4e2" },
  { agency: "Dawn Labs", code: "AG-0887", contact: "James Lee", email: "james.lee@dawnlabs.com", sentBy: "Israel N.", sentDate: "12 May 2026", expires: { label: "Expired", tone: "red" }, status: "Expired", tone: "red", linkToken: "inv_ag0887_f8a1" },
  { agency: "Silverline Partners", code: "AG-0643", contact: "Emma Davis", email: "emma@silverline.com", sentBy: "Thandi M.", sentDate: "8 May 2026", expires: { label: "—", tone: "neutral" }, status: "Declined", tone: "neutral", linkToken: "inv_ag0643_c209" },
];

const statusTone: Record<Status, string> = {
  Invited: "blue", Accepted: "green", Expired: "red", Declined: "neutral", Revoked: "neutral",
};

type AuditEntry = { id: number; actor: string; action: string; target: string; at: string };

const ACTOR = "Thandi M.";

function nowStamp() {
  return new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function InvitationsPage() {
  const [tab, setTab] = useState<Status | "all">("all");
  const [rows, setRows] = useState<Invite[]>(seed);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Invite | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  const visible = useMemo(
    () => (tab === "all" ? rows : rows.filter((i) => i.status === tab)),
    [tab, rows],
  );

  const counts = useMemo(() => ({
    all: rows.length,
    Invited: rows.filter((r) => r.status === "Invited").length,
    Accepted: rows.filter((r) => r.status === "Accepted").length,
    Declined: rows.filter((r) => r.status === "Declined").length,
    Expired: rows.filter((r) => r.status === "Expired").length,
    Revoked: rows.filter((r) => r.status === "Revoked").length,
  }), [rows]);

  const tabs: { key: Status | "all"; label: string; tone: string }[] = [
    { key: "all", label: "All", tone: "neutral" },
    { key: "Invited", label: "Invited", tone: "amber" },
    { key: "Accepted", label: "Accepted", tone: "green" },
    { key: "Declined", label: "Declined", tone: "red" },
    { key: "Expired", label: "Expired", tone: "red" },
    { key: "Revoked", label: "Revoked", tone: "neutral" },
  ];

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const log = (action: string, target: string) => {
    setAudit((a) => [
      { id: Date.now() + Math.random(), actor: ACTOR, action, target, at: nowStamp() },
      ...a,
    ].slice(0, 50));
  };

  // BR-INV-005: Resend logs a new send event and refreshes expiry to 7 days.
  const resend = (inv: Invite) => {
    if (inv.status === "Accepted" || inv.status === "Revoked") return;
    setRows((rs) => rs.map((r) => r.code === inv.code ? {
      ...r,
      status: "Invited",
      tone: "blue",
      sentDate: todayLabel(),
      expires: { label: "7 days", tone: "amber" },
    } : r));
    log("Resent invitation", `${inv.agency} · ${inv.code} → ${inv.email}`);
    flash(`Invitation resent to ${inv.email}. Expiry refreshed to 7 days.`);
  };

  // BR-INV-001 / BR-INV-002: Copy the unique link; copy never extends or reactivates.
  const copyLink = async (inv: Invite) => {
    const url = `https://talvault.app/invite/${inv.linkToken}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    log("Copied invite link", `${inv.agency} · ${inv.code}`);
    flash("Link copied. Copying does not extend or reactivate the invite — status and expiry still apply.");
  };

  // BR-INV-003 / BR-INV-004: Email may be updated only before acceptance.
  const openEdit = (inv: Invite) => {
    if (inv.status !== "Invited" && inv.status !== "Expired") return;
    setEditing(inv);
    setEmailDraft(inv.email);
  };
  const saveEdit = () => {
    if (!editing) return;
    const oldEmail = editing.email;
    setRows((rs) => rs.map((r) => r.code === editing.code ? { ...r, email: emailDraft } : r));
    log("Updated recipient email", `${editing.agency} · ${editing.code}: ${oldEmail} → ${emailDraft}`);
    flash("Recipient email updated. A fresh invite must be resent for the change to take effect.");
    setEditing(null);
  };

  const revoke = (inv: Invite) => {
    if (inv.status !== "Invited" && inv.status !== "Expired") return;
    setRows((rs) => rs.map((r) => r.code === inv.code ? {
      ...r,
      status: "Revoked",
      tone: "neutral",
      expires: { label: "Revoked", tone: "neutral" },
    } : r));
    log("Revoked invitation", `${inv.agency} · ${inv.code}`);
    flash(`Invitation to ${inv.agency} revoked.`);
  };

  const exportCsv = () => {
    const headers = ["Agency", "Code", "Contact", "Email", "Sent By", "Sent Date", "Expires In", "Status"];
    const csvRows = visible.map((i) => [i.agency, i.code, i.contact, i.email, i.sentBy, i.sentDate, i.expires.label, i.status]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitations-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log("Exported invitations CSV", `Filter: ${tab} · ${visible.length} rows`);
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agency Invitations</h1>
          <div className="tvp-subtitle">Track and manage agency invitations sent by TalVault Admin.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Send className="h-4 w-4" />Send Invitation
          </Link>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div><strong>This screen shows only invitations sent by TalVault Admin to agency contacts.</strong></div>
      </div>

      <div className="tvp-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className={`tvp-status tvp-${t.tone}`}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input className="tvp-search" placeholder="Search invitations..." />
          <div className="tvp-row-actions" style={{ flexWrap: "wrap" }}>
            <select className="tvp-select"><option>Status: All</option></select>
            <select className="tvp-select"><option>Sent By: All</option></select>
            <select className="tvp-select"><option>Agency Type: All</option></select>
            <select className="tvp-select"><option>Sort by: Newest</option><option>Oldest</option><option>Status</option><option>Agency Name</option></select>
          </div>
        </div>
        <table className="tvp-table">
          <thead>
            <tr><th>Agency</th><th>Main Contact</th><th>Sent By</th><th>Sent Date</th><th>Expires In</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {visible.map((i) => {
              const isInvited = i.status === "Invited";
              const isExpired = i.status === "Expired";
              const canEditEmail = isInvited || isExpired; // BR-INV-003
              const canResend = isInvited || isExpired;    // BR-INV-005
              const canRevoke = isInvited || isExpired;
              const canCopy = i.status !== "Revoked";
              const emailEditReason = i.status === "Accepted"
                ? "Email locked — account already accepted (BR-INV-004). Use account update process."
                : i.status === "Declined"
                ? "Declined invites cannot be edited."
                : i.status === "Revoked"
                ? "Revoked invites cannot be edited."
                : "Edit recipient email";
              return (
                <tr key={i.code}>
                  <td><strong>{i.agency}</strong><br /><span className="tvp-muted">{i.code}</span></td>
                  <td>{i.contact}<br /><span className="tvp-muted">{i.email}</span></td>
                  <td>{i.sentBy}</td>
                  <td>{i.sentDate}</td>
                  <td><span className={`tvp-status tvp-${i.expires.tone}`}>{i.expires.label}</span></td>
                  <td><span className={`tvp-status tvp-${statusTone[i.status]}`}>{i.status}</span></td>
                  <td className="tvp-row-actions">
                    <button
                      className="tvp-mini-btn"
                      title={emailEditReason}
                      disabled={!canEditEmail}
                      onClick={() => openEdit(i)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="tvp-mini-btn"
                      title={canResend ? "Resend invitation (refreshes expiry)" : "Resend not available for this status"}
                      disabled={!canResend}
                      onClick={() => resend(i)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="tvp-mini-btn"
                      title={canCopy ? "Copy invite link (does not extend expiry)" : "Link disabled — invite revoked"}
                      disabled={!canCopy}
                      onClick={() => copyLink(i)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="tvp-mini-btn"
                      title={canRevoke ? "Revoke invitation" : "Cannot revoke — already resolved"}
                      disabled={!canRevoke}
                      onClick={() => revoke(i)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tvp-card tvp-panel" style={{ marginTop: 16 }}>
        <div className="tvp-panel-head">
          <h2 className="tvp-h2"><ShieldCheck className="h-4 w-4 inline mr-1" /> Invitation audit trail</h2>
          <span className="tvp-muted">BR-INV-006 · session-only view</span>
        </div>
        {audit.length === 0 ? (
          <div className="tvp-muted" style={{ padding: "8px 2px" }}>
            No invitation actions in this session yet. Resend, copy, edit-email, revoke and export actions will appear here.
          </div>
        ) : (
          <table className="tvp-table">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{a.at}</td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td>{a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEditing(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,32,51,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
          }}
        >
          <div
            className="tvp-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(480px, 92vw)" }}
          >
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Update recipient email</h2>
              <button className="tvp-mini-btn" onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="tvp-muted" style={{ marginBottom: 10 }}>
              {editing.agency} · {editing.code}. Allowed only before acceptance (BR-INV-003).
            </div>
            <input
              className="tvp-search"
              style={{ width: "100%", marginBottom: 12 }}
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="new.email@agency.com"
            />
            <div className="tvp-row-actions" style={{ justifyContent: "flex-end" }}>
              <button className="tvp-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="tvp-primary"
                disabled={!emailDraft || emailDraft === editing.email || !emailDraft.includes("@")}
                onClick={saveEdit}
              >
                Save email
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 70,
            background: "#142033", color: "#fff", padding: "10px 14px",
            borderRadius: 8, maxWidth: 360, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
