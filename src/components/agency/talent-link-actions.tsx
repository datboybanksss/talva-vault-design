/**
 * Shared row actions for a talent relationship (agency portal). Used by the
 * dashboard overview, recent activity and the talent roster so every list
 * offers the same actions for the same status. The allowed set comes from
 * lib/status-actions.ts, which the server functions also enforce.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  CircleStop,
  Eye,
  Link2,
  RefreshCw,
  RotateCcw,
  Send,
  Tags,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import type { RowAction } from "@/components/shared/row-actions-menu";
import { useAgencyReadOnly } from "@/components/agency/agency-read-only";
import {
  endTalentRelationship,
  logAgencyCopyLinkMine,
  reactivateTalentRelationship,
  resendAgencyInvitationMine,
  revokeAgencyInvitationMine,
} from "@/lib/agency.functions";
import { talentLinkActions } from "@/lib/status-actions";
import { friendlyError } from "@/lib/friendly-error";
import { useConfirm } from "@/components/shared/use-confirm";

export type TalentLinkRowLike = {
  id: string;
  displayName: string;
  status: string;
  talentType?: string | null;
  managerUserId?: string | null;
  talentInvitationId?: string | null;
  inviteToken?: string | null;
  inviteStatus?: string | null;
};

export function useTalentLinkRowActions(opts: {
  isOwner: boolean;
  onChangeType?: (row: TalentLinkRowLike) => void;
  onAssignManager?: (row: TalentLinkRowLike) => void;
  /** Hide "View details" (used on the details page itself). */
  hideOpen?: boolean;
}) {
  const { confirm: askConfirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const readOnly = useAgencyReadOnly();
  const writable = !readOnly;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["agency", "talent"] });
    qc.invalidateQueries({ queryKey: ["agency", "invitations"] });
    qc.invalidateQueries({ queryKey: ["agency", "vault", "talent-links"] });
  };

  const endFn = useServerFn(endTalentRelationship);
  const reactivateFn = useServerFn(reactivateTalentRelationship);
  const resendFn = useServerFn(resendAgencyInvitationMine);
  const revokeFn = useServerFn(revokeAgencyInvitationMine);
  const logCopyFn = useServerFn(logAgencyCopyLinkMine);

  const endMut = useMutation({
    mutationFn: (id: string) => endFn({ data: { id } }),
    onSuccess: () => {
      toast.success(
        "Relationship ended. Existing documents remain accessible; new uploads are blocked.",
      );
      invalidate();
    },
    onError: (e) => toast.error(friendlyError(e, "Could not end the relationship")),
  });
  const reactivateMut = useMutation({
    mutationFn: (id: string) => reactivateFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Relationship reactivated.");
      invalidate();
    },
    onError: (e) => toast.error(friendlyError(e, "Could not reactivate the relationship")),
  });
  const resendMut = useMutation({
    mutationFn: (invitationId: string) =>
      resendFn({ data: { id: invitationId, type: "talent", extend_days: 14 } }),
    onSuccess: () => {
      toast.success("Invitation resent · expiry refreshed · logged.");
      invalidate();
    },
    onError: (e) => toast.error(friendlyError(e, "Could not resend the invitation")),
  });
  const revokeMut = useMutation({
    mutationFn: (invitationId: string) => revokeFn({ data: { id: invitationId, type: "talent" } }),
    onSuccess: () => {
      toast.success("Invitation revoked and logged.");
      invalidate();
    },
    onError: (e) => toast.error(friendlyError(e, "Could not revoke the invitation")),
  });

  const copyLink = async (r: TalentLinkRowLike) => {
    if (!r.inviteToken || !r.talentInvitationId) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/invite/talent/${r.inviteToken}`,
      );
      await logCopyFn({ data: { id: r.talentInvitationId, type: "talent" } });
      toast.success("Link copied. Copy does not extend expiry.");
    } catch {
      toast.error("Copy failed");
    }
  };

  const build = (r: TalentLinkRowLike): RowAction[] => {
    const inviteInDate = r.inviteStatus ? r.inviteStatus === "pending" : true;
    const allowed = talentLinkActions({
      status: r.status,
      inviteInDate,
      isOwner: opts.isOwner,
      writable,
    });
    const hasInvite = !!r.talentInvitationId;
    const out: RowAction[] = [];
    for (const a of allowed) {
      switch (a) {
        case "open":
          if (!opts.hideOpen)
            out.push({
              key: "open",
              label: "View details",
              icon: Eye,
              onSelect: () => navigate({ to: "/agency/talent/$linkId", params: { linkId: r.id } }),
            });
          break;
        case "resend":
          if (hasInvite)
            out.push({
              key: "resend",
              label: "Resend invitation",
              icon: RefreshCw,
              title: "Refreshes expiry and logs a new send",
              disabled: resendMut.isPending,
              onSelect: () => resendMut.mutate(r.talentInvitationId!),
            });
          break;
        case "copy_link":
          if (hasInvite && r.inviteToken)
            out.push({
              key: "copy",
              label: "Copy invite link",
              icon: Link2,
              title: "Copying does not extend expiry",
              onSelect: () => copyLink(r),
            });
          break;
        case "reinvite":
          out.push({
            key: "reinvite",
            label: "Reinvite",
            icon: Send,
            onSelect: () => {
              // An invitation that is still stored as open just needs a fresh
              // expiry; otherwise start a new invitation through the same flow.
              if (hasInvite && r.status === "invited") resendMut.mutate(r.talentInvitationId!);
              else navigate({ to: "/agency/talent/invite" });
            },
          });
          break;
        case "change_type":
          if (opts.onChangeType)
            out.push({
              key: "type",
              label: "Change talent type",
              icon: Tags,
              onSelect: () => opts.onChangeType!(r),
            });
          break;
        case "assign_manager":
          if (opts.onAssignManager)
            out.push({
              key: "manager",
              label: r.managerUserId ? "Change manager" : "Assign manager",
              icon: UserCog,
              onSelect: () => opts.onAssignManager!(r),
            });
          break;
        case "reactivate":
          out.push({
            key: "reactivate",
            label: "Reactivate relationship",
            icon: RotateCcw,
            disabled: reactivateMut.isPending,
            onSelect: async () => {
              if (
                await askConfirm({
                  title: `Reactivate relationship with ${r.displayName}?`,
                  confirmLabel: "Reactivate",
                })
              )
                reactivateMut.mutate(r.id);
            },
          });
          break;
        case "revoke":
          if (hasInvite)
            out.push({
              key: "revoke",
              label: "Revoke invitation",
              icon: Ban,
              destructive: true,
              separatorBefore: true,
              disabled: revokeMut.isPending,
              onSelect: async () => {
                if (
                  await askConfirm({
                    title: `Revoke the invitation to ${r.displayName}?`,
                    confirmLabel: "Revoke invitation",
                    destructive: true,
                  })
                )
                  revokeMut.mutate(r.talentInvitationId!);
              },
            });
          break;
        case "end_relationship":
          out.push({
            key: "end",
            label: "End relationship",
            icon: CircleStop,
            destructive: true,
            separatorBefore: true,
            disabled: endMut.isPending,
            onSelect: async () => {
              if (
                await askConfirm({
                  title: `End working relationship with ${r.displayName}?`,
                  body: "Existing shared documents remain accessible under current retention rules. New uploads and versions will be blocked until reactivated.",
                  confirmLabel: "End relationship",
                  destructive: true,
                })
              )
                endMut.mutate(r.id);
            },
          });
          break;
      }
    }
    return out;
  };
  return Object.assign(build, { dialog });
}
