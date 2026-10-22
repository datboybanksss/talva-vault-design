import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Pause, Play, RotateCcw } from "lucide-react";
import { ModalShell } from "@/components/shared/modal-shell";
import type { RowAction } from "@/components/shared/row-actions-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeAccountState, getReadOnlyYears } from "@/lib/admin.functions";
import {
  ACCOUNT_ACTION_LABEL,
  accountActionEffect,
  accountStateActions,
  reasonsFor,
  type AccountStateAction,
} from "@/lib/account-state";
import { friendlyError } from "@/lib/friendly-error";

type Target = {
  type: "agency" | "talent";
  id: string;
  name: string;
  paused: boolean;
  suspended: boolean;
};

const ICON = { pause: Pause, unpause: Play, suspend: Ban, unsuspend: RotateCcw };
const DONE: Record<AccountStateAction, string> = {
  pause: "Account paused and logged.",
  unpause: "Account unpaused and logged.",
  suspend: "Account suspended and logged.",
  unsuspend: "Account unsuspended and logged.",
};

/**
 * Pause / Unpause / Suspend / Unsuspend for Admin, shared by the Accounts list
 * and the account detail pages. Actions come from accountStateActions.
 */
export function useAccountStateActions() {
  const [open, setOpen] = useState<{ target: Target; action: AccountStateAction } | null>(null);
  const actionsFor = (target: Target, opts: { separatorBefore?: boolean } = {}): RowAction[] =>
    accountStateActions(target, true).map((action, i) => ({
      key: action,
      label: ACCOUNT_ACTION_LABEL[action],
      icon: ICON[action],
      destructive: action === "pause" || action === "suspend",
      separatorBefore: i === 0 && opts.separatorBefore,
      onSelect: () => setOpen({ target, action }),
    }));
  const dialog = open ? (
    <AccountStateDialog target={open.target} action={open.action} onClose={() => setOpen(null)} />
  ) : null;
  return { actionsFor, dialog, openAction: (target: Target, action: AccountStateAction) => setOpen({ target, action }) };
}

function AccountStateDialog({
  target,
  action,
  onClose,
}: {
  target: Target;
  action: AccountStateAction;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const changeFn = useServerFn(changeAccountState);
  const yearsFn = useServerFn(getReadOnlyYears);
  const years = useQuery({ queryKey: ["admin", "read-only-years"], queryFn: () => yearsFn() });
  const needsReason = action === "pause" || action === "suspend";
  const reasons = needsReason ? reasonsFor(action) : {};
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () =>
      changeFn({
        data: {
          type: target.type,
          id: target.id,
          action,
          ...(needsReason ? { reason } : {}),
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(DONE[action]);
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e, "We couldn't change this account.")),
  });
  const canSubmit = (!needsReason || !!reason) && !m.isPending && years.data !== undefined;
  const titleId = "account-state-title";

  return (
    <ModalShell onClose={onClose} labelledBy={titleId} maxWidth={520}>
      <div className="tvp-panel-head">
        <h2 className="tvp-h2" id={titleId}>
          {ACCOUNT_ACTION_LABEL[action]}: {target.name}
        </h2>
      </div>
      <p className="tvp-muted">
        {years.data
          ? accountActionEffect(action, target.type, years.data.years)
          : "Loading…"}
      </p>
      {needsReason && (
        <div className="tvp-form-group">
          <label htmlFor="account-state-reason">Reason</label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="account-state-reason">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(reasons).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="tvp-form-group">
        <label htmlFor="account-state-note">Note (optional)</label>
        <textarea
          id="account-state-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <p className="tvp-muted">
        The reason and note are kept in the audit log for administrators only. They're never shown to
        the account.
      </p>
      <div className="tvp-footer-actions">
        <button type="button" className="tvp-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={needsReason ? "tvp-danger" : "tvp-primary"}
          disabled={!canSubmit}
          onClick={() => canSubmit && m.mutate()}
        >
          {m.isPending ? "Saving…" : ACCOUNT_ACTION_LABEL[action]}
        </button>
      </div>
    </ModalShell>
  );
}
