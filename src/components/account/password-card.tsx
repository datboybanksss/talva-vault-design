import { useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/password-input";
import {
  MIN_PW_LENGTH,
  PW_POLICY_HINT,
  checkRequirements,
  scorePassword,
  validateNewPassword,
  friendlyAuthError,
} from "@/lib/password";
import { SectionHeader } from "./section-header";

export function PasswordCard({
  email,
  logPasswordChange,
}: {
  email: string;
  logPasswordChange: () => Promise<unknown>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(next), [next]);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!current) {
      setError("Enter your current password to confirm the change.");
      return;
    }
    const v = validateNewPassword(next);
    if (v) return setError(v);
    if (next !== confirm)
      return setError("New password and confirmation do not match.");
    if (next === current)
      return setError("New password must be different from your current password.");

    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInErr) throw new Error("Current password is incorrect.");

      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) throw updErr;

      await logPasswordChange();

      setInfo("Password updated. Use your new password next time you sign in.");
      toast.success("Password updated.");
      reset();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<KeyRound className="h-4 w-4" />}
        tone="teal"
        title="Change password"
        subtitle={`Updates the password for ${email}.`}
      />

      <form onSubmit={submit} style={{ marginTop: 8 }} noValidate>
        <div className="tv-auth-field" style={{ marginTop: 0 }}>
          <label htmlFor="pw-current">Current password</label>
          <PasswordInput
            id="pw-current"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            placeholder="Your current password"
            minLength={1}
          />
        </div>

        <div className="tv-auth-field">
          <label htmlFor="pw-new">New password</label>
          <PasswordInput
            id="pw-new"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PW_LENGTH} characters`}
            minLength={MIN_PW_LENGTH}
          />
          <div className="tv-auth-hint">
            {PW_POLICY_HINT} Breached passwords are rejected automatically.
          </div>
          {next.length > 0 && (
            <>
              <ul className="tv-auth-reqs" aria-live="polite">
                {(() => {
                  const r = checkRequirements(next);
                  return (
                    <>
                      <li className={r.length ? "ok" : ""}>
                        {r.length ? "✓" : "•"} At least {MIN_PW_LENGTH} characters
                      </li>
                      <li className={r.upper ? "ok" : ""}>
                        {r.upper ? "✓" : "•"} An uppercase letter
                      </li>
                      <li className={r.lower ? "ok" : ""}>
                        {r.lower ? "✓" : "•"} A lowercase letter
                      </li>
                      <li className={r.number ? "ok" : ""}>
                        {r.number ? "✓" : "•"} A number
                      </li>
                      <li className={r.special ? "ok" : ""}>
                        {r.special ? "✓" : "•"} A special character
                      </li>
                    </>
                  );
                })()}
              </ul>
              <div className="tv-auth-strength" aria-live="polite">
                <div className="tv-auth-strength-bar">
                  <div
                    className="tv-auth-strength-fill"
                    style={{ width: `${strength.pct}%`, background: strength.color }}
                  />
                </div>
                <div className="tv-auth-strength-row">
                  <span className="tv-auth-strength-label">Strength</span>
                  <span className={`tv-auth-strength-value ${strength.tier}`}>
                    {strength.label}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="tv-auth-field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <PasswordInput
            id="pw-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Re-enter new password"
            minLength={MIN_PW_LENGTH}
          />
        </div>

        {error && <div className="tv-form-alert tv-form-alert-error">{error}</div>}
        {info && <div className="tv-form-alert tv-form-alert-info">{info}</div>}

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button type="submit" className="tvp-primary" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
          <button
            type="button"
            className="tvp-secondary"
            onClick={reset}
            disabled={busy}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
