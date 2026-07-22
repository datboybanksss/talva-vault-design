import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/password-input";
import { friendlyAuthError } from "@/lib/password";
import { SectionHeader } from "./section-header";

export function TwoFactorCard({
  email,
  required = false,
  logEnrolled,
  logDisabled,
  contextLabel = "administrator",
}: {
  email: string;
  required?: boolean;
  logEnrolled: (payload: { factor_type: string }) => Promise<unknown>;
  logDisabled: () => Promise<unknown>;
  contextLabel?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = (data?.totp ?? []).find((f) => f.status === "verified");
      setEnrolled(!!verified);
      for (const f of data?.totp ?? []) {
        if (f.status !== "verified" && f.id !== pendingFactorId) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnroll = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.totp ?? []) {
        if (f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `TalVault (${email})`,
      });
      if (error) throw error;
      setPendingFactorId(data.id);
      setQrSvg((data.totp as any)?.qr_code ?? null);
      setSecret((data.totp as any)?.secret ?? null);
      setEnrolling(true);
      setCode("");
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (pendingFactorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
      } catch { /* ignore */ }
    }
    setEnrolling(false);
    setPendingFactorId(null);
    setQrSvg(null);
    setSecret(null);
    setCode("");
    setError(null);
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFactorId) return;
    setError(null);
    setBusy(true);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      await logEnrolled({ factor_type: "totp" });
      toast.success("Two-factor authentication enabled.");
      setEnrolling(false);
      setPendingFactorId(null);
      setQrSvg(null);
      setSecret(null);
      setCode("");
      await refresh();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const startDisable = () => {
    setDisabling(true);
    setDisablePw("");
    setError(null);
  };

  const cancelDisable = () => {
    setDisabling(false);
    setDisablePw("");
    setError(null);
  };

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: disablePw,
      });
      if (signInErr) throw new Error("Password is incorrect.");
      const { data: list, error: lErr } = await supabase.auth.mfa.listFactors();
      if (lErr) throw lErr;
      for (const f of list?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      await logDisabled();
      toast.success("Two-factor authentication disabled.");
      setDisabling(false);
      setDisablePw("");
      await refresh();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<Smartphone className="h-4 w-4" />}
        tone="purple"
        title="Two-factor authentication"
        subtitle={
          required
            ? `Required for your ${contextLabel} role. A 6-digit code from your authenticator app is needed on every sign-in.`
            : "Require a 6-digit code from your authenticator app on every sign-in."
        }
      />

      {loading ? (
        <div className="tvp-muted" style={{ marginTop: 8 }}>Loading…</div>
      ) : enrolled && !disabling ? (
        <div style={{ marginTop: 8 }}>
          <div className="tv-form-alert tv-form-alert-info">
            2FA is <strong>enabled</strong> on this account. You'll be prompted for a
            code from your authenticator app when you sign in.
            {required && (
              <> Two-factor authentication is required for your role and cannot be disabled.</>
            )}
          </div>
          {!required && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="tvp-secondary"
                onClick={startDisable}
                disabled={busy}
              >
                Disable 2FA
              </button>
            </div>
          )}
        </div>
      ) : disabling ? (
        <form onSubmit={confirmDisable} style={{ marginTop: 8 }} noValidate>
          <div className="tv-form-alert tv-form-alert-info">
            Confirm your password to disable two-factor authentication.
          </div>
          <div className="tv-auth-field" style={{ marginTop: 10 }}>
            <label htmlFor="mfa-disable-pw">Current password</label>
            <PasswordInput
              id="mfa-disable-pw"
              value={disablePw}
              onChange={setDisablePw}
              autoComplete="current-password"
              placeholder="Your current password"
              minLength={1}
            />
          </div>
          {error && <div className="tv-form-alert tv-form-alert-error">{error}</div>}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button type="submit" className="tvp-danger" disabled={busy || !disablePw}>
              {busy ? "Disabling…" : "Disable 2FA"}
            </button>
            <button
              type="button"
              className="tvp-secondary"
              onClick={cancelDisable}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : enrolling ? (
        <form onSubmit={verifyEnroll} style={{ marginTop: 8 }} noValidate>
          <div className="tvp-muted" style={{ fontSize: 12 }}>
            Scan the QR code below with an authenticator app (Google Authenticator,
            Authy, 1Password, etc.), then enter the 6-digit code it displays.
          </div>
          {qrSvg && (
            <div
              style={{
                marginTop: 10,
                background: "white",
                padding: 12,
                borderRadius: 12,
                width: "fit-content",
              }}
            >
              <img
                src={qrSvg}
                alt="Two-factor authentication QR code"
                width={192}
                height={192}
                style={{ display: "block" }}
              />
            </div>
          )}
          {secret && (
            <div className="tv-auth-hint" style={{ marginTop: 6 }}>
              Can't scan? Enter this key manually:{" "}
              <code
                style={{
                  background: "var(--tvp-surface-soft)",
                  padding: "2px 6px",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {secret}
              </code>
            </div>
          )}
          <div className="tv-auth-field">
            <label htmlFor="mfa-enroll-code">Enter code from app</label>
            <input
              id="mfa-enroll-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
            />
          </div>
          {error && <div className="tv-form-alert tv-form-alert-error">{error}</div>}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button
              type="submit"
              className="tvp-primary"
              disabled={busy || code.length !== 6}
            >
              {busy ? "Verifying…" : "Verify & enable 2FA"}
            </button>
            <button
              type="button"
              className="tvp-secondary"
              onClick={cancelEnroll}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div className="tvp-muted" style={{ fontSize: 13 }}>
            Add an extra sign-in step using a time-based code from an authenticator
            app on your phone.{" "}
            {required
              ? `Required for your ${contextLabel} role — you must enable 2FA to keep accessing this console.`
              : "Strongly recommended."}
          </div>
          {error && (
            <div className="tv-form-alert tv-form-alert-error" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="tvp-primary"
              onClick={startEnroll}
              disabled={busy}
            >
              {busy ? "Preparing…" : "Enable 2FA"}
            </button>
          </div>
        </div>
      )}
      {info && !enrolling && !disabling && (
        <div className="tv-form-alert tv-form-alert-info" style={{ marginTop: 10 }}>
          {info}
        </div>
      )}
    </div>
  );
}
