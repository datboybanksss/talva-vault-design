import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AtSign, BadgeCheck, Clock3, Save, Trash2 } from "lucide-react";
import {
  setAgencyBillingSender,
  resendAgencyBillingSenderVerification,
  clearAgencyBillingSender,
} from "@/lib/agency.functions";
import { isValidEmail } from "@/components/shared/email-chips-input";

/**
 * Per-agency "send from" address for quotes and invoices. The address is only
 * used on outbound mail once the owner has confirmed it from their inbox.
 */
export function BillingSenderCard({
  email,
  displayName,
  verifiedAt,
  pendingUntil,
}: {
  email: string | null;
  displayName: string | null;
  verifiedAt: string | null;
  pendingUntil: string | null;
}) {
  const qc = useQueryClient();
  const setFn = useServerFn(setAgencyBillingSender);
  const resendFn = useServerFn(resendAgencyBillingSenderVerification);
  const clearFn = useServerFn(clearAgencyBillingSender);

  const [value, setValue] = useState(email ?? "");
  const [name, setName] = useState(displayName ?? "");

  const refresh = () => qc.invalidateQueries({ queryKey: ["agency", "billing-settings"] });

  const save = useMutation({
    mutationFn: () => setFn({ data: { email: value.trim(), display_name: name.trim() || null } }),
    onSuccess: (res: any) => {
      refresh();
      if (res?.sent) toast.success(`Verification email sent to ${value.trim()}`);
      else toast.warning("Address saved, but the verification email could not be delivered yet");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save address"),
  });

  const resend = useMutation({
    mutationFn: () => resendFn({}),
    onSuccess: () => { refresh(); toast.success("Verification email resent"); },
    onError: (e: any) => toast.error(e.message ?? "Could not resend"),
  });

  const clear = useMutation({
    mutationFn: () => clearFn({}),
    onSuccess: () => { refresh(); setValue(""); setName(""); toast.success("Sending address removed"); },
    onError: (e: any) => toast.error(e.message ?? "Could not remove"),
  });

  const verified = !!verifiedAt && !!email;
  const pending = !!email && !verified;
  const dirty = value.trim().toLowerCase() !== (email ?? "").toLowerCase() || name.trim() !== (displayName ?? "");
  const canSave = isValidEmail(value) && dirty;

  return (
    <div className="tvp-card tvp-panel">
      <h3 className="tvp-h3">
        <AtSign className="inline h-4 w-4 mr-1" />Sending address
      </h3>
      <div className="tvp-muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Quotes and invoices go out from TalVault's verified mail domain. Once your own address is
        confirmed, it is shown as your agency and set as the reply-to, so client replies come
        straight to you.
      </div>

      {email && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
            padding: "8px 10px", borderRadius: "var(--r-sm, 6px)",
            background: verified ? "var(--tvp-green-bg, #e8f5ec)" : "var(--tvp-amber-bg, #fdf3e2)",
            color: verified ? "var(--tvp-green, #1d7a45)" : "var(--tvp-amber, #a1620a)",
            fontWeight: 600, fontSize: 13,
          }}
        >
          {verified ? <BadgeCheck className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          <span>{verified ? "Verified" : "Pending verification"} · {email}</span>
        </div>
      )}

      <div className="tvp-form-group">
        <label htmlFor="billing-from-email">Send-from address</label>
        <input
          id="billing-from-email"
          type="email"
          value={value}
          placeholder="billing@youragency.co.za"
          onChange={(e) => setValue(e.target.value)}
        />
        {value && !isValidEmail(value) && (
          <div style={{ color: "var(--tvp-red, #b3261e)", fontSize: 12, marginTop: 4 }}>
            Enter a valid email address
          </div>
        )}
      </div>
      <div className="tvp-form-group">
        <label htmlFor="billing-from-name">Display name (optional)</label>
        <input
          id="billing-from-name"
          value={name}
          placeholder="Accounts team"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="tvp-primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
          <Save className="h-4 w-4" />
          {save.isPending ? "Sending…" : email && !dirty ? "Saved" : "Save & verify"}
        </button>
        {pending && (
          <button className="tvp-secondary" disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? "Resending…" : "Resend verification"}
          </button>
        )}
        {email && (
          <button className="tvp-secondary" disabled={clear.isPending} onClick={() => clear.mutate()}>
            <Trash2 className="h-4 w-4" />Remove
          </button>
        )}
      </div>

      {pending && pendingUntil && (
        <div className="tvp-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Verification link expires {new Date(pendingUntil).toLocaleString("en-ZA")}. Until then,
          replies go to your agency contact address.
        </div>
      )}
    </div>
  );
}
