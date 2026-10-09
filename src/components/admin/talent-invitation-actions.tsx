import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, FileEdit, Link2, RefreshCw, Eye } from "lucide-react";
import type { RowAction } from "@/components/shared/row-actions-menu";
import {
  getIndependentTalentInvitation,
  resendIndependentTalentInvitation,
  revokeIndependentTalentInvitation,
} from "@/lib/independent-talent.functions";
import { EMAIL_FALLBACK_NOTICE } from "@/lib/invitation-email";

export const TALENT_INVITE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  declined: "Declined",
  revoked: "Revoked",
};
export const TALENT_INVITE_STATUS_TONE: Record<string, string> = {
  draft: "amber",
  pending: "blue",
  accepted: "green",
  expired: "red",
  declined: "neutral",
  revoked: "neutral",
};

/** State-driven row actions for an admin-sent (independent) talent invitation. */
export function useTalentInvitationActions() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getIndependentTalentInvitation);
  const resendFn = useServerFn(resendIndependentTalentInvitation);
  const revokeFn = useServerFn(revokeIndependentTalentInvitation);

  const resendM = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id, extend_days: 14 } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      if (res?.email_sent) toast.success("Invitation resent · expiry refreshed · logged.");
      else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't resend the invitation."),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation revoked. The ID document and proof of talent were deleted.");
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't revoke the invitation."),
  });

  const copyLink = async (id: string) => {
    try {
      const res: any = await getFn({ data: { id } });
      if (!res?.invite_url) throw new Error("This invitation has no live link.");
      await navigator.clipboard.writeText(res.invite_url);
      toast.success("Link copied. Copy does not extend expiry.");
    } catch (e: any) {
      toast.error(e?.message ?? "Copy failed");
    }
  };

  return (row: { id: string; status: string; talent_name: string }): RowAction[] => {
    const open = row.status === "pending";
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
        hidden: !open,
        title: "Copying does not extend expiry",
        onSelect: () => copyLink(row.id),
      },
      {
        key: "resend",
        label: "Resend invitation",
        icon: RefreshCw,
        hidden: !open,
        title: "Logs a new send and refreshes expiry",
        onSelect: () => resendM.mutate(row.id),
      },
      {
        key: "revoke",
        label: "Revoke invitation",
        icon: Ban,
        hidden: !open,
        destructive: true,
        separatorBefore: true,
        title: "Also deletes the ID document and proof of talent",
        onSelect: () => {
          if (confirm(`Revoke the invitation to ${row.talent_name}? Their ID document and proof of talent will be deleted.`)) {
            revokeM.mutate(row.id);
          }
        },
      },
    ];
  };
}
