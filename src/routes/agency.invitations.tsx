import { useFolderNames } from "@/lib/folder-catalogue";
import { usePagedList } from "@/lib/pagination";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { sendTalentInvitationEmail, sendStaffInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_TALENT_INVITATION_SUBJECT,
  DEFAULT_TALENT_INVITATION_BODY,
  DEFAULT_STAFF_INVITATION_SUBJECT,
  DEFAULT_STAFF_INVITATION_BODY,
  EMAIL_FALLBACK_NOTICE,
} from "@/lib/invitation-email";
import { LoadMoreRow } from "@/components/shared/load-more";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, RefreshCw, Ban, Send, X, Check, Settings2, ShieldCheck, FolderCog, Mail, Trash2 } from "lucide-react";
import { ModalShell } from "@/components/shared/modal-shell";
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
  listAgencyStaffRoster,
  updateAgencyStaffRole,
  removeAgencyStaffMember,
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

const EMPTY_STATE: Record<"all" | "talent" | "staff" | "expired" | "revoked", string> = {
  all: "No invitations yet — invite your first talent or staff member to get started.",
  talent: "No talent invitations yet — invite your first talent to get started.",
  staff: "No staff invitations yet — invite your first staff member to get started.",
  expired: "No expired invitations.",
  revoked: "No revoked invitations.",
};

const STAFF_ROLE_LABEL: Record<string, string> = {
  owner: "Manager (Owner)",
  lead: "Lead manager",
  staff: "Staff manager",
};

function InvitationsPage() {
  const navigate = useNavigate();
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
  const list = useMemo(() => invites.data ?? [], [invites.data]);
  const filteredRows = useMemo(() => {
    switch (tab) {
      case "all": return list;
      case "talent": return list.filter((i: any) => i.type === "talent");
      case "staff": return list.filter((i: any) => i.type === "staff");
      case "expired": return list.filter((i: any) => i.status === "expired");
      case "revoked": return list.filter((i: any) => i.status === "revoked");
    }
  }, [list, tab]);

  const page = usePagedList(filteredRows, { resetKey: tab });
  const visible = page.visible;

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
    const url =
      inv.type === "talent"
        ? `${window.location.origin}/invite/talent/${inv.token}`
        : `${window.location.origin}/invite/${inv.token}`;
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
        <div className="tvp-actions" data-tour="agency-invite-actions">
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

      <div className="tvp-tabs" data-tour="agency-invite-tabs">
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

      <div className="tvp-stack">
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
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {invites.isLoading && (
                <tr><td colSpan={8} className="tvp-muted">Loading…</td></tr>
              )}
              {!invites.isLoading && visible.length === 0 && (
                <tr><td colSpan={8} className="tvp-muted">{EMPTY_STATE[tab]}</td></tr>
              )}
              {visible.map((i: any) => {
                const dLeft = daysBetween(i.expires_at);
                const isOpen = (i.stored_status ?? i.status) === "pending";
                const expiryTone =
                  isOpen && dLeft < 0 ? "red"
                    : isOpen && dLeft <= 3 ? "amber"
                      : "neutral";
                const expiryLabel =
                  !isOpen ? "—"
                    : dLeft < 0 ? "Expired"
                      : `${dLeft} day${dLeft === 1 ? "" : "s"}`;
                return (
                  <tr key={`${i.type}-${i.id}`}>
                    <td style={{ whiteSpace: "nowrap" }}><strong>{i.recipient_name ?? "—"}</strong></td>
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
                      <RowActionsMenu
                        actions={[
                          isOwner && {
                            key: "email", label: "Edit & send email", icon: Mail,
                            onSelect: () =>
                              navigate({
                                to: "/agency/invitations/$id/email-preview",
                                params: { id: i.id },
                                search: { type: i.type as "talent" | "staff" },
                              }),
                          },
                          {
                            key: "copy", label: "Copy invite link", icon: Link2,
                            title: "Copying does not extend expiry",
                            onSelect: () => copyLink(i),
                          },
                          (i.stored_status ?? i.status) === "pending" && isOwner && {
                            key: "resend", label: "Resend invitation", icon: RefreshCw,
                            title: "Refreshes expiry and logs a new send",
                            onSelect: () => resendM.mutate({ id: i.id, type: i.type }),
                          },
                          (i.stored_status ?? i.status) === "pending" && isOwner && {
                            key: "revoke", label: "Revoke invitation", icon: Ban,
                            destructive: true, separatorBefore: true,
                            onSelect: () => {
                              if (confirm(`Revoke invitation to ${i.email}?`))
                                revokeM.mutate({ id: i.id, type: i.type });
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              <LoadMoreRow
                colSpan={8}
                noun="invitations"
                shown={page.shown}
                total={page.total}
                hasMore={page.hasMore}
                onLoadMore={page.loadMore}
              />
            </tbody>
          </table>
        </div>
      </div>

      <ActiveStaffCard isOwner={isOwner} />
      </div>


      {openForm && (
        <NewInvitationModal
          type={openForm}
          onClose={() => setOpenForm(null)}
          onSubmit={async (payload) => {
            try {
              if (openForm === "talent") {
                const inv: any = await createTalent({ data: payload as any });
                const res: any = await sendTalentInvitationEmail({
                  data: {
                    id: inv.id,
                    subject: DEFAULT_TALENT_INVITATION_SUBJECT,
                    body: DEFAULT_TALENT_INVITATION_BODY,
                    invite_url: `${window.location.origin}/invite/talent/${inv.token}`,
                  },
                }).catch(() => ({ sent: false }));
                if (res?.sent) toast.success("Talent invitation sent.");
                else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
              } else {
                const inv: any = await createStaff({ data: payload as any });
                const res: any = await sendStaffInvitationEmail({
                  data: {
                    id: inv.id,
                    subject: DEFAULT_STAFF_INVITATION_SUBJECT,
                    body: DEFAULT_STAFF_INVITATION_BODY,
                    invite_url: `${window.location.origin}/invite/${inv.token}`,
                  },
                }).catch(() => ({ sent: false }));
                if (res?.sent) toast.success("Staff invitation sent.");
                else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
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

  const folderNames = useFolderNames();
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
    const fallback = folderNames;
    for (const n of fallback) if (!seen.has(n)) seen.set(n, { name: n, retention_years: null });
    return { standardFolders: std, allFolders: Array.from(seen.values()) };
  }, [templates.data, folderNames]);

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
          <button title="Close" className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
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
                  <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. full name as it appears on ID" />
                </div>
              ) : (
                <div className="tvp-form-group">
                  <label>Contact person</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. full name as it appears on ID" />
                </div>
              )}
              <div className="tvp-form-group">
                <label>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@email.com" />
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


/**
 * Active staff roster. Everyone who has accepted a staff invitation, with the
 * role they hold today. The agency owner can change a staff member's role
 * here; the change is audit logged like every other agency action.
 */
function ActiveStaffCard({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const rosterFn = useServerFn(listAgencyStaffRoster);
  const roleFn = useServerFn(updateAgencyStaffRole);
  const removeStaffFn = useServerFn(removeAgencyStaffMember);
  const [confirmRemove, setConfirmRemove] = useState<any | null>(null);

  const staff = useQuery({
    queryKey: ["agency", "staff-roster"],
    queryFn: () => rosterFn(),
  });

  const changeRole = useMutation({
    mutationFn: (v: { member_id: string; role: "staff" | "lead" }) => roleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "staff-roster"] });
      toast.success("Role updated and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update role"),
  });

  const removeStaff = useMutation({
    mutationFn: (v: { member_id: string }) => removeStaffFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "staff-roster"] });
      setConfirmRemove(null);
      toast.success("Staff member removed and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove staff member"),
  });

  const rows = (staff.data ?? []) as any[];

  return (
    <div className="tvp-card">
      {/* Same header inset as other table cards (Quotes & Invoices workspace). */}
      <div className="tvp-panel-head" style={{ padding: "16px 18px 0", margin: 0 }}>
        <div>
          <h2 className="tvp-h2">Active staff</h2>
          <div className="tvp-subtitle">
            {isOwner
              ? "People who have accepted a staff invitation. Only you, as the Manager (Owner), can change a role."
              : "People who have accepted a staff invitation. Only the Manager (Owner) can change a role."}
          </div>
        </div>
      </div>
      <div className="tvp-table-wrap">
        <table className="tvp-table">
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Status</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {staff.isLoading && <tr><td colSpan={6} className="tvp-muted">Loading…</td></tr>}
            {!staff.isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="tvp-muted">No staff members yet — invite a staff member to get started.</td></tr>
            )}
            {rows.map((m) => {
              const editable = isOwner && m.role !== "owner" && !m.isSelf && !m.suspended;
              const isLead = m.role === "lead";
              return (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong>{m.isSelf && <span className="tvp-status tvp-neutral" style={{ marginLeft: 6 }}>You</span>}</td>
                  <td>{m.email || "—"}</td>
                  <td>
                    <span className="tvp-status tvp-neutral">
                      {STAFF_ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </td>
                  <td>{fmtDate(m.joinedAt)}</td>
                  <td>
                    <span className={`tvp-status tvp-${m.suspended ? "red" : "green"}`}>
                      {m.suspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td>
                    {/* Same shared kebab pattern as the invitations table; the
                        action set is filtered by role, permissions and state. */}
                    <RowActionsMenu
                      actions={[
                        editable && !isLead && {
                          key: "make-lead",
                          label: "Make lead manager",
                          icon: ShieldCheck,
                          title: "Full talent operations",
                          disabled: changeRole.isPending,
                          onSelect: () => changeRole.mutate({ member_id: m.id, role: "lead" }),
                        },
                        editable && isLead && {
                          key: "make-staff",
                          label: "Make staff manager",
                          icon: Settings2,
                          title: "View and limited actions",
                          disabled: changeRole.isPending,
                          onSelect: () => changeRole.mutate({ member_id: m.id, role: "staff" }),
                        },
                        isOwner && m.role !== "owner" && !m.isSelf && {
                          key: "remove",
                          label: "Remove from agency",
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          title: "Ends their access to this agency",
                          disabled: removeStaff.isPending,
                          onSelect: () => setConfirmRemove(m),
                        },
                        !!m.email && {
                          key: "copy-email",
                          label: "Copy email address",
                          icon: Link2,
                          separatorBefore: editable,
                          onSelect: async () => {
                            try {
                              await navigator.clipboard.writeText(m.email);
                              toast.success("Email address copied.");
                            } catch {
                              toast.error("Copy failed");
                            }
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmRemove && (
        <ModalShell
          onClose={() => setConfirmRemove(null)}
          maxWidth={460}
          labelledBy="staff-remove-title"
        >
          <h2 className="tvp-h2" id="staff-remove-title">
            Remove {confirmRemove.name} from your agency?
          </h2>
          <p className="tvp-muted" style={{ marginTop: 8 }}>
            They lose access to this agency's workspace on their next page. Everything they filed or
            recorded stays exactly where it is, and the removal is written to your activity log.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" className="tvp-secondary" onClick={() => setConfirmRemove(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="tvp-danger"
              onClick={() => removeStaff.mutate({ member_id: confirmRemove.id })}
              disabled={removeStaff.isPending}
            >
              {removeStaff.isPending ? "Removing…" : "Remove staff member"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
