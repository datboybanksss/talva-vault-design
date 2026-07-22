import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, RefreshCw, Ban, Send, X, Check, Settings2, ShieldCheck, FolderCog } from "lucide-react";
import { toast } from "sonner";
import {
  agencyWhoami,
  listAgencyInvitationsMine,
  createTalentInvitationMine,
  createStaffInvitationMine,
  resendAgencyInvitationMine,
  revokeAgencyInvitationMine,
  logAgencyCopyLinkMine,
  listAgencyFolderTemplates,
} from "@/lib/agency.functions";


export const Route = createFileRoute("/agency/invitations")({
  head: () => ({ meta: [{ title: "Invitations · TalVault" }] }),
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
                <th style={{ minWidth: 180, whiteSpace: "nowrap" }}>Recipient</th>
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

type FolderItem = { name: string; sort_order?: number; retention_years?: number | null };

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
  const [panel, setPanel] = useState<"details" | "folders">("details");
  const [folderMode, setFolderMode] = useState<"standard" | "custom">("standard");
  const [customFolders, setCustomFolders] = useState<Set<string>>(new Set());

  const templatesFn = useServerFn(listAgencyFolderTemplates);
  const templates = useQuery({
    queryKey: ["agency", "folder-templates"],
    queryFn: () => templatesFn(),
    enabled: type === "talent",
  });

  const { standardFolders, allFolders } = useMemo(() => {
    const tpls = templates.data?.templates ?? [];
    const items = templates.data?.items ?? [];
    const defaultTpl = tpls.find((t: any) => t.is_default) ?? tpls[0];
    const std: FolderItem[] = defaultTpl
      ? items
          .filter((i: any) => i.template_id === defaultTpl.id)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((i: any) => ({
            name: i.folder_name as string,
            sort_order: i.sort_order as number,
            retention_years: (i.default_retention_years ?? null) as number | null,
          }))
      : [];
    // union of all folder names across templates (for the Customise picker)
    const seen = new Map<string, FolderItem>();
    for (const i of items) {
      const n = i.folder_name as string;
      if (!seen.has(n)) {
        seen.set(n, {
          name: n,
          sort_order: i.sort_order as number,
          retention_years: (i.default_retention_years ?? null) as number | null,
        });
      }
    }
    // Fallback so customise still shows something before templates are configured
    const fallback = ["ID Documents", "Contracts", "Endorsements", "Invoices", "Travel", "Tax"];
    for (const n of fallback) if (!seen.has(n)) seen.set(n, { name: n, retention_years: null });
    return { standardFolders: std, allFolders: Array.from(seen.values()) };
  }, [templates.data]);

  const activeSelection: FolderItem[] = useMemo(() => {
    if (type !== "talent") return [];
    if (folderMode === "standard") return standardFolders;
    return allFolders
      .filter((f) => customFolders.has(f.name))
      .map((f, i) => ({ ...f, sort_order: i }));
  }, [type, folderMode, standardFolders, allFolders, customFolders]);

  const canSubmit =
    email.trim() &&
    (type === "staff" ? true : name.trim()) &&
    (type === "staff" ? true : activeSelection.length > 0) &&
    !busy;

  const showFoldersPanel = type === "talent" && panel === "folders";
  const primaryLabel =
    busy
      ? "Sending…"
      : type === "staff"
        ? "Create & send invitation"
        : showFoldersPanel
          ? `Set up ${name.trim() || "talent"}’s folders & send invite`
          : "Next: choose folders";

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
        style={{ width: "min(640px, 94vw)", maxHeight: "92vh", overflow: "auto" }}
      >
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">
            {type === "talent" ? "New Talent Invitation" : "New Staff Invitation"}
          </h2>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        {type === "talent" && (
          <div className="tvp-stepper" style={{ marginTop: 4 }}>
            <div className={`tvp-step ${panel === "details" ? "tvp-active" : "tvp-done"}`}>
              <div className="tvp-step-num">1</div>
              <div><div className="tvp-step-title">Details</div><div className="tvp-step-sub">Name, email, expiry</div></div>
            </div>
            <div className={`tvp-step ${panel === "folders" ? "tvp-active" : ""}`}>
              <div className="tvp-step-num">2</div>
              <div><div className="tvp-step-title">Folders</div><div className="tvp-step-sub">Standard or custom</div></div>
            </div>
          </div>
        )}

        <p className="tvp-muted" style={{ fontSize: 12, marginTop: 8 }}>
          {type === "talent"
            ? "Invites a talent to your Roster. Choose which shared folders they’ll get on acceptance."
            : "Invites a staff member to your agency. Only agency owners can send staff invitations."}
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (type === "talent" && panel === "details") {
              if (!name.trim() || !email.trim()) return;
              setPanel("folders");
              return;
            }
            if (!canSubmit) return;
            setBusy(true);
            const payload =
              type === "talent"
                ? {
                    talent_name: name.trim(),
                    email: email.trim(),
                    expiry_days: expiryDays,
                    folder_mode: folderMode,
                    folder_selection: activeSelection.map((f, i) => ({
                      name: f.name,
                      sort_order: f.sort_order ?? i,
                      retention_years: f.retention_years ?? null,
                    })),
                  }
                : { contact_person: name.trim() || undefined, email: email.trim(), role, expiry_days: expiryDays };
            await onSubmit(payload);
            setBusy(false);
          }}
        >
          {(!showFoldersPanel) && (
            <>
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
                    <option value="staff">Staff manager (view + limited actions)</option>
                    <option value="lead">Lead manager (full talent operations)</option>
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
            </>
          )}

          {showFoldersPanel && (
            <div
              className="tvp-sub-card"
              style={{
                marginTop: 8,
                borderColor: "rgba(20, 184, 166, 0.35)",
                background: "rgba(20, 184, 166, 0.06)",
              }}
            >
              <h3 className="tvp-h3" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <FolderCog className="h-4 w-4" /> Folders for {name.trim() || "this talent"}
              </h3>

              <div className="tvp-ai-box" style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="tvp-small">
                  Folders inside the Roster Shared Folder are visible to both you and the talent.
                  The talent also gets a separate Private Vault for personal documents — you can’t see those.
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setFolderMode("standard")}
                  className={`tvp-rule-card ${folderMode === "standard" ? "tvp-active" : ""}`}
                  style={{ textAlign: "left", flexDirection: "column", alignItems: "stretch", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Check className="h-4 w-4" /> Use my standard set
                    </strong>
                    <span className="tvp-small tvp-muted">Recommended</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {standardFolders.length === 0
                      ? <span className="tvp-small tvp-muted">No default template configured yet.</span>
                      : standardFolders.map((f) => <span key={f.name} className="tvp-badge">{f.name}</span>)}
                  </div>
                  <div className="tvp-small tvp-muted" style={{ marginTop: 8 }}>
                    Pulled from your default Folder Template.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFolderMode("custom")}
                  className={`tvp-rule-card ${folderMode === "custom" ? "tvp-active" : ""}`}
                  style={{ textAlign: "left", flexDirection: "column", alignItems: "stretch", cursor: "pointer" }}
                >
                  <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Settings2 className="h-4 w-4" /> Customise for this talent
                  </strong>
                  <div className="tvp-small tvp-muted" style={{ marginTop: 8 }}>
                    Pick and choose folders. Useful for atypical engagements.
                  </div>
                  {folderMode === "custom" && (
                    <div className="tvp-small" style={{ marginTop: 8 }}>
                      {customFolders.size} folder{customFolders.size === 1 ? "" : "s"} selected
                    </div>
                  )}
                </button>
              </div>

              {folderMode === "custom" && (
                <div className="tvp-rule-grid" style={{ marginTop: 14 }}>
                  {allFolders.map((f) => {
                    const on = customFolders.has(f.name);
                    const inStd = standardFolders.some((s) => s.name === f.name);
                    return (
                      <label key={f.name} className="tvp-rule-card">
                        <span>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              setCustomFolders((prev) => {
                                const next = new Set(prev);
                                if (next.has(f.name)) next.delete(f.name); else next.add(f.name);
                                return next;
                              });
                            }}
                          />{" "}
                          {f.name}
                        </span>
                        <span className="tvp-small">{inStd ? "Recommended" : "Optional"}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="tvp-small tvp-muted" style={{ marginTop: 10 }}>
                Defaults are configured in{" "}
                <Link to="/agency/folder-templates" className="tvp-link">Folder Templates</Link>.
              </div>
            </div>
          )}

          <div className="tvp-footer-actions">
            {type === "talent" && showFoldersPanel && (
              <button type="button" className="tvp-secondary" onClick={() => setPanel("details")}>Back</button>
            )}
            <button type="button" className="tvp-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="tvp-primary"
              disabled={
                busy
                || !email.trim()
                || (type === "talent" && !name.trim())
                || (showFoldersPanel && activeSelection.length === 0)
              }
            >
              {primaryLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

