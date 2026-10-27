import { useConfirm } from "@/components/shared/use-confirm";
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, FileEdit, Link2, Mail, Pencil, RefreshCw, Send, Trash2, X } from "lucide-react";
import { invitationActions } from "@/lib/status-actions";
import type { RowAction } from "@/components/shared/row-actions-menu";
import {
  deleteAgencyInvitation,
  logCopyLink,
  resendInvitation,
  revokeInvitation,
  updateInvitationEmail,
} from "@/lib/admin.functions";
import { sendAgencyInvitationEmail } from "@/lib/invitation-email.functions";
import { EMAIL_FALLBACK_NOTICE } from "@/lib/invitation-email";
import { friendlyError } from "@/lib/friendly-error";

export type AgencyInviteRow = {
  id: string;
  status: string;
  stored_status?: string | null;
  agency_name: string;
  email: string;
  token?: string | null;
};

/**
 * State-driven row actions for an admin-sent agency invitation, shared by the
 * Admin overview and the Invitations list. Render `dialogs` once on the page.
 */
export function useAgencyInvitationActions(): {
  actionsFor: (row: AgencyInviteRow) => RowAction[];
  dialogs: ReactNode;
} {
  const { confirm: askConfirm, dialog: askConfirmDialog } = useConfirm();
  const nav = useNavigate();
  const qc = useQueryClient();
  const resendFn = useServerFn(resendInvitation);
  const sendAgencyEmailFn = useServerFn(sendAgencyInvitationEmail);
  const revokeFn = useServerFn(revokeInvitation);
  const updateEmailFn = useServerFn(updateInvitationEmail);
  const logCopyFn = useServerFn(logCopyLink);
  const deleteFn = useServerFn(deleteAgencyInvitation);

  const [editing, setEditing] = useState<AgencyInviteRow | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AgencyInviteRow | null>(null);

  const resendM = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id, extend_days: 14 } }),
    onSuccess: async (inv) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      // Expiry is refreshed regardless; only claim the email went out if it did.
      const res = await sendAgencyEmailFn({
        data: { id: inv.id },
      }).catch(() => ({ sent: false }));
      if (res?.sent) toast.success("Invitation resent · expiry refreshed · logged.");
      else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
    },
    onError: (e) => toast.error(friendlyError(e, "Failed to resend")),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation revoked and logged.");
    },
    onError: (e) => toast.error(friendlyError(e, "Failed to revoke")),
  });
  const updateEmailM = useMutation({
    mutationFn: (v: { id: string; email: string }) => updateEmailFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setEditing(null);
      toast.success("Email updated and logged.");
    },
    onError: (e) => toast.error(friendlyError(e, "Failed to update email")),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setPendingDelete(null);
      toast.success(
        res?.agency_deleted ? "Invitation and agency shell deleted." : "Invitation deleted.",
      );
    },
    onError: (e) => toast.error(friendlyError(e, "Failed to delete")),
  });

  const copyLink = async (inv: AgencyInviteRow) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
      await logCopyFn({ data: { id: inv.id } });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      toast.success("Link copied. Copy does not extend expiry.");
    } catch (e) {
      toast.error(friendlyError(e, "We couldn't copy the invitation link."));
    }
  };

  const actionsFor = (i: AgencyInviteRow): RowAction[] => {
    const isOpen = (i.stored_status ?? i.status) === "pending";
    const allowed = invitationActions({
      status: i.status,
      storedStatus: i.stored_status,
      viewer: "admin",
      canWrite: true,
    });
    const list: Array<RowAction | false> = [
      allowed.includes("continue_draft") && {
        key: "continue",
        label: "Continue draft",
        icon: FileEdit,
        title: "Add compliance documents and send",
        onSelect: () => nav({ to: "/admin/invitations/new", search: { draft: i.id } }),
      },
      i.status !== "draft" && {
        key: "preview",
        label: "View sent email",
        icon: Mail,
        to: "/admin/invitations/$id/email-preview",
        params: { id: i.id },
        search: { type: "agency" },
      },
      allowed.includes("copy_link") && {
        key: "copy",
        label: "Copy invite link",
        icon: Link2,
        title: "Copying does not extend expiry",
        onSelect: () => copyLink(i),
      },
      allowed.includes("edit_email") && {
        key: "edit",
        label: "Edit email address",
        icon: Pencil,
        title: "Only possible before the invitation is accepted",
        onSelect: () => {
          setEditing(i);
          setEmailDraft(i.email);
        },
      },
      allowed.includes("resend") && {
        key: "resend",
        label: "Resend invitation",
        icon: RefreshCw,
        title: "Logs a new send and refreshes expiry",
        onSelect: () => resendM.mutate(i.id),
      },
      allowed.includes("reinvite") && {
        key: "reinvite",
        label: "Reinvite",
        icon: Send,
        onSelect: () =>
          isOpen
            ? resendM.mutate(i.id)
            : nav({ to: "/admin/invitations/new", search: { type: "agency" } }),
      },
      allowed.includes("revoke") && {
        key: "revoke",
        label: "Revoke invitation",
        icon: Ban,
        destructive: true,
        separatorBefore: true,
        onSelect: async () => {
          if (
            await askConfirm({ title: `Revoke invitation to ${i.agency_name}?`, destructive: true })
          )
            revokeM.mutate(i.id);
        },
      },
      (allowed.includes("delete") || i.status === "pending") && {
        key: "delete",
        label: i.status === "draft" ? "Delete draft" : "Delete invitation",
        icon: Trash2,
        destructive: true,
        separatorBefore: i.status === "draft",
        title: "Removes compliance documents, and the shell agency if it has no members",
        onSelect: () => setPendingDelete(i),
      },
    ];
    return list.filter(Boolean) as RowAction[];
  };

  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  } as const;

  const dialogs = (
    <>
      {askConfirmDialog}
      {editing && (
        <div role="dialog" aria-modal="true" onClick={() => setEditing(null)} style={overlay}>
          <div
            className="tvp-card tvp-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(520px, 92vw)" }}
          >
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Edit invitation email</h2>
              <button title="Close" className="tvp-mini-btn" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="tvp-muted" style={{ fontSize: 12 }}>
              Editing is only allowed before acceptance. After acceptance, updates go through
              account settings.
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
                onClick={() => updateEmailM.mutate({ id: editing.id, email: emailDraft })}
                disabled={!emailDraft || emailDraft === editing.email || updateEmailM.isPending}
              >
                Save & log
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div role="dialog" aria-modal="true" onClick={() => setPendingDelete(null)} style={overlay}>
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
              This permanently removes the invitation to{" "}
              <strong>{pendingDelete.agency_name}</strong> (
              <span className="tvp-muted">{pendingDelete.email}</span>), deletes any uploaded
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
                onClick={() => deleteM.mutate(pendingDelete.id)}
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

  return { actionsFor, dialogs };
}
