import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Send, Link2, RefreshCw, Ban, Pencil, X, Mail, Clock, CheckCircle2, AlertCircle, Trash2, FileEdit } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyInvitations,
  resendInvitation,
  revokeInvitation,
  updateInvitationEmail,
  logCopyLink,
  deleteAgencyInvitation,
} from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invitations/")({
  validateSearch: (raw: Record<string, unknown>) => ({
    email: typeof raw.email === "string" ? raw.email : "",
  }),
  head: () => ({ meta: [{ title: "Agency Invitations · TalVault Admin" }] }),
  component: InvitationsPage,
});

const statusLabel: Record<string, string> = {
  draft: "Draft",
  pending: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  declined: "Declined",
  revoked: "Revoked",
};
const statusTone: Record<string, string> = {
  draft: "amber",
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
  const deleteFn = useServerFn(deleteAgencyInvitation);
  const nav = useNavigate();
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
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setPendingDelete(null);
      toast.success(
        res?.agency_deleted
          ? "Invitation and agency shell deleted."
          : "Invitation deleted.",
      );
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  const { email: emailParam } = Route.useSearch();
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState(emailParam);
  const [editing, setEditing] = useState<any | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // When arriving with ?email=..., prefill the search box, find the matching
  // pending invite, scroll to it, and flash the row so it's obvious.
  useEffect(() => {
    if (!emailParam || !invites.data) return;
    setSearch(emailParam);
    const match = invites.data.find(
      (i: any) => (i.email ?? "").toLowerCase() === emailParam.toLowerCase(),
    );
    if (!match) return;
    setHighlightId(match.id);
    // Wait a tick so the filtered row is rendered.
    const t = setTimeout(() => {
      rowRefs.current[match.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const clear = setTimeout(() => setHighlightId(null), 2400);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [emailParam, invites.data]);

  const list = invites.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: list.length,
      draft: 0, pending: 0, accepted: 0, expired: 0, declined: 0, revoked: 0,
    };
    for (const i of list) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [list]);

  const visible = useMemo(() => {
    return list.filter((i: any) => {
      if (tab !== "all" && i.status !== tab) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(i.agency_name ?? "").toLowerCase().includes(q) &&
          !(i.email ?? "").toLowerCase().includes(q) &&
          !(i.contact_person ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [list, tab, search]);

  const filtersActive = tab !== "all" || !!search;
  const resetFilters = () => { setTab("all"); setSearch(""); };

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

      {/* KPI row */}
      <div className="tvp-grid tvp-kpi-grid">
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("all")}>
          <div className="tvp-kpi-icon tvp-bg-teal"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.all}</div>
            <div className="tvp-kpi-label">Total Invitations</div>
            <div className="tvp-kpi-sub" style={{ color: counts.all > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {counts.all > 0 ? "Across all statuses" : "None sent yet"}
            </div>
          </div>
        </button>
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("pending")}>
          <div className="tvp-kpi-icon tvp-bg-amber"><Clock className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.pending ?? 0}</div>
            <div className="tvp-kpi-label">Awaiting Acceptance</div>
            <div className="tvp-kpi-sub tvp-warn" style={{ color: (counts.pending ?? 0) > 0 ? "var(--tvp-amber)" : "var(--tvp-muted)" }}>
              {(counts.pending ?? 0) > 0 ? "Follow up if stale" : "No outstanding invites"}
            </div>
          </div>
        </button>
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("accepted")}>
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.accepted ?? 0}</div>
            <div className="tvp-kpi-label">Accepted</div>
            <div className="tvp-kpi-sub" style={{ color: (counts.accepted ?? 0) > 0 ? "var(--tvp-green)" : "var(--tvp-muted)" }}>
              {(counts.accepted ?? 0) > 0 ? "Onboarded successfully" : "None yet"}
            </div>
          </div>
        </button>
        <button className="tvp-card tvp-kpi tvp-clickable" onClick={() => setTab("expired")}>
          <div className="tvp-kpi-icon tvp-bg-red"><AlertCircle className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{counts.expired ?? 0}</div>
            <div className="tvp-kpi-label">Expired / Lapsed</div>
            <div className="tvp-kpi-sub" style={{ color: (counts.expired ?? 0) > 0 ? "var(--tvp-red)" : "var(--tvp-green)" }}>
              {(counts.expired ?? 0) > 0 ? "Resend to reopen" : "All fresh"}
            </div>
          </div>
        </button>
      </div>

      {/* Life chip row */}
      <div className="tvp-life-chips">
        {["all", "pending", "accepted", "expired", "declined", "revoked"].map((k) => (
          <button
            key={k}
            className={`tvp-life-chip${tab === k ? " tvp-active-filter" : ""} tvp-bg-${k === "all" ? "teal" : statusTone[k] ?? "neutral"}`}
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
            placeholder="Search agency, email, contact..."
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
                  <tr
                    key={i.id}
                    ref={(el) => { rowRefs.current[i.id] = el; }}
                    className={highlightId === i.id ? "tvp-row-flash" : undefined}
                  >
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
                        <Link
                          to="/admin/invitations/$id/email-preview"
                          params={{ id: i.id }}
                          className="tvp-mini-btn"
                          title="Preview branded email"
                        >
                          <Mail className="h-4 w-4" />
                        </Link>
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
