import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, FileEdit, Link2, RefreshCw, Eye, Send } from "lucide-react";
import { invitationActions } from "@/lib/status-actions";
import type { RowAction } from "@/components/shared/row-actions-menu";
import {
  getIndependentTalentInvitation,
  resendIndependentTalentInvitation,
  revokeIndependentTalentInvitation,
} from "@/lib/independent-talent.functions";
import { EMAIL_FALLBACK_NOTICE } from "@/lib/invitation-email";
import { logTalentInviteCopyLink } from "@/lib/admin.functions";
import { friendlyError } from "@/lib/friendly-error";

/** State-driven row actions for an admin-sent (independent) talent invitation. */
export function useTalentInvitationActions() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getIndependentTalentInvitation);
  const resendFn = useServerFn(resendIndependentTalentInvitation);
  const revokeFn = useServerFn(revokeIndependentTalentInvitation);
  const logCopyFn = useServerFn(logTalentInviteCopyLink);

  const resendM = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id, extend_days: 14 } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      if (res?.email_sent) toast.success("Invitation resent · expiry refreshed · logged.");
      else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't resend the invitation.")),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation revoked. The ID document and proof of talent were deleted.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't revoke the invitation.")),
  });

  const copyLink = async (id: string) => {
    try {
      const res: any = await getFn({ data: { id } });
      if (!res?.invite_url) throw new Error("This invitation has no live link.");
      await navigator.clipboard.writeText(res.invite_url);
      await logCopyFn({ data: { id } }).catch(() => undefined);
      toast.success("Link copied. Copy does not extend expiry.");
    } catch (e: any) {
      toast.error(friendlyError(e, "Copy failed"));
    }
  };

  return (row: {
    id: string;
    status: string;
    stored_status?: string | null;
    talent_name: string;
  }): RowAction[] => {
    const allowed = invitationActions({
      status: row.status,
      storedStatus: row.stored_status,
      viewer: "admin",
      canWrite: true,
    });
    const storedOpen = (row.stored_status ?? row.status) === "pending";
    return [
      {
        key: "open",
        label: row.status === "draft" ? "Open draft" : "Open invitation",
        icon: row.status === "draft" ? FileEdit : Eye,
        onSelect: () => nav({ to: "/admin/invitations/talent/$id", params: { id: row.id } }),
      },
      {
        key: "copy",
        label: "Copy invite link",
        icon: Link2,
        hidden: !allowed.includes("copy_link"),
        title: "Copying does not extend expiry",
        onSelect: () => copyLink(row.id),
      },
      {
        key: "resend",
        label: "Resend invitation",
        icon: RefreshCw,
        hidden: !allowed.includes("resend"),
        title: "Logs a new send and refreshes expiry",
        onSelect: () => resendM.mutate(row.id),
      },
      {
        key: "reinvite",
        label: "Reinvite",
        icon: Send,
        hidden: !allowed.includes("reinvite"),
        title: storedOpen
          ? "Sends the invitation again with a fresh expiry"
          : "Starts a new invitation — the ID document and proof of talent are needed again",
        onSelect: () =>
          storedOpen ? resendM.mutate(row.id) : nav({ to: "/admin/invitations/talent/new" }),
      },
      {
        key: "revoke",
        label: "Revoke invitation",
        icon: Ban,
        hidden: !allowed.includes("revoke"),
        destructive: true,
        separatorBefore: true,
        title: "Also deletes the ID document and proof of talent",
        onSelect: () => {
          if (
            confirm(
              `Revoke the invitation to ${row.talent_name}? Their ID document and proof of talent will be deleted.`,
            )
          ) {
            revokeM.mutate(row.id);
          }
        },
      },
    ];
  };
}
