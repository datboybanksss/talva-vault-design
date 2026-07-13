import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserRound, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import {
  whoami,
  updateOwnProfile,
  logOwnEmailChangeRequest,
  logOwnPasswordChange,
  logMfaEnrolled,
  logMfaDisabled,
} from "@/lib/admin.functions";
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

export const Route = createFileRoute("/admin/my-account")({
  head: () => ({ meta: [{ title: "My Account · TalVault Admin" }] }),
  component: MyAccountPage,
});

function MyAccountPage() {
  const whoamiFn = useServerFn(whoami);
  const me = useQuery({ queryKey: ["whoami"], queryFn: () => whoamiFn() });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">My Account</h1>
          <div className="tvp-subtitle">
            Your personal admin profile, email and password. Changes only affect
            your own account.
          </div>
        </div>
      </div>

      {me.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}

      {me.data && (
        <div className="tvp-account-grid">
          <div className="tvp-account-full">
            <ProfileCard me={me.data} />
          </div>
          <EmailCard me={me.data} />
          <ChangePasswordCard email={me.data.email} />
          <div className="tvp-account-full">
            <TwoFactorCard email={me.data.email} />
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Profile ----------------------------- */

function ProfileCard({ me }: { me: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOwnProfile);

  const [firstName, setFirstName] = useState(me.firstName ?? "");
  const [lastName, setLastName] = useState(me.lastName ?? "");
  const [designation, setDesignation] = useState(me.designation ?? "");

  // Keep local state in sync if the whoami query refetches with fresh values.
  useEffect(() => {
    setFirstName(me.firstName ?? "");
    setLastName(me.lastName ?? "");
    setDesignation(me.designation ?? "");
  }, [me.firstName, me.lastName, me.designation]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          designation: designation.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Profile updated.");
      qc.invalidateQueries({ queryKey: ["whoami"] });
      qc.invalidateQueries({ queryKey: ["admin", "administrators"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update profile"),
  });

  const dirty =
    (firstName || "").trim() !== (me.firstName ?? "") ||
    (lastName || "").trim() !== (me.lastName ?? "") ||
    (designation || "").trim() !== (me.designation ?? "");

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<UserRound className="h-4 w-4" />}
        tone="teal"
        title="Profile"
        subtitle="Your name and role as it appears across the platform."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ marginTop: 8 }}
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          <div className="tv-auth-field" style={{ marginTop: 0 }}>
            <label htmlFor="first_name">First name</label>
            <input
              id="first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Israel"
              maxLength={80}
            />
          </div>
          <div className="tv-auth-field" style={{ marginTop: 0 }}>
            <label htmlFor="last_name">Last name</label>
            <input
              id="last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Noko"
              maxLength={80}
            />
          </div>
        </div>

        <div className="tv-auth-field">
          <label htmlFor="designation">Designation / title</label>
          <input
            id="designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="e.g. Platform Operations Lead"
            maxLength={120}
            disabled={!me.isMainAdmin}
            readOnly={!me.isMainAdmin}
          />
          <div className="tv-auth-hint">
            {me.isMainAdmin
              ? "Shown alongside your name in admin surfaces and audit records."
              : "Only the Main Administrator can change your designation. Ask them to update it if needed."}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button
            type="submit"
            className="tvp-primary"
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ Email ------------------------------ */

function EmailCard({ me }: { me: any }) {
  const logEmailFn = useServerFn(logOwnEmailChangeRequest);
  const [email, setEmail] = useState(me.email ?? "");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEmail(me.email ?? ""), [me.email]);

  const dirty = email.trim().toLowerCase() !== (me.email ?? "").toLowerCase();

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!dirty) return;

    setBusy(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        email: email.trim(),
      });
      if (updErr) throw updErr;
      await logEmailFn({ data: { new_email: email.trim() } });
      setInfo(
        "Confirmation email sent to the new address. Click the link there to complete the change — your current email keeps working until you do.",
      );
      toast.success("Email change requested. Check your inbox.");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        tone="purple"
        title="Sign-in email"
        subtitle="Requires confirmation via a link sent to the new address."
      />

      <form onSubmit={request} style={{ marginTop: 12 }} noValidate>
        <div className="tv-auth-field" style={{ marginTop: 0 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <div className="tv-auth-hint">
            We'll send a confirmation link to the new address. Your current
            email stays active until you click it.
          </div>
        </div>

        {error && <div className="tv-form-alert tv-form-alert-error">{error}</div>}
        {info && <div className="tv-form-alert tv-form-alert-info">{info}</div>}

        <div style={{ marginTop: 16 }}>
          <button
            type="submit"
            className="tvp-primary"
            disabled={!dirty || busy}
          >
            {busy ? "Sending…" : "Request email change"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------- Password ---------------------------- */

function ChangePasswordCard({ email }: { email: string }) {
  const logChangeFn = useServerFn(logOwnPasswordChange);
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

      await logChangeFn();

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

      <form onSubmit={submit} style={{ marginTop: 12 }} noValidate>
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

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
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

/* ----------------------------- Shared ----------------------------- */

function SectionHeader({
  icon,
  tone,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  tone: "teal" | "purple";
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        className={`tvp-kpi-icon tvp-bg-${tone}`}
        style={{ width: 36, height: 36 }}
      >
        {icon}
      </div>
      <div>
        <h2 className="tvp-h2" style={{ margin: 0 }}>{title}</h2>
        <div className="tvp-muted" style={{ fontSize: 12 }}>{subtitle}</div>
      </div>
    </div>
  );
}

/* ---------------------- Two-factor authentication --------------------- */

function TwoFactorCard({ email }: { email: string }) {
  const logEnrolledFn = useServerFn(logMfaEnrolled);
  const logDisabledFn = useServerFn(logMfaDisabled);

  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  // Enrollment (setup) state
  const [enrolling, setEnrolling] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // Disable flow
  const [disabling, setDisabling] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  // Feedback
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
      // Clean up abandoned unverified factors
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
      // Clear any prior unverified factors first.
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
      await logEnrolledFn({ data: { factor_type: "totp" } });
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
      // Re-authenticate with password before disabling — same pattern as email/password change.
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
      await logDisabledFn();
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
        subtitle="Require a 6-digit code from your authenticator app on every sign-in."
      />

      {loading ? (
        <div className="tvp-muted" style={{ marginTop: 12 }}>Loading…</div>
      ) : enrolled && !disabling ? (
        <div style={{ marginTop: 12 }}>
          <div className="tv-form-alert tv-form-alert-info">
            2FA is <strong>enabled</strong> on this account. You'll be prompted for a
            code from your authenticator app when you sign in.
          </div>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="tvp-secondary"
              onClick={startDisable}
              disabled={busy}
            >
              Disable 2FA
            </button>
          </div>
        </div>
      ) : disabling ? (
        <form onSubmit={confirmDisable} style={{ marginTop: 12 }} noValidate>
          <div className="tv-form-alert tv-form-alert-info">
            Confirm your password to disable two-factor authentication.
          </div>
          <div className="tv-auth-field" style={{ marginTop: 12 }}>
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
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
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
        <form onSubmit={verifyEnroll} style={{ marginTop: 12 }} noValidate>
          <div className="tvp-muted" style={{ fontSize: 12 }}>
            Scan the QR code below with an authenticator app (Google Authenticator,
            Authy, 1Password, etc.), then enter the 6-digit code it displays.
          </div>
          {qrSvg && (
            <div
              style={{
                marginTop: 12,
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
            <div className="tv-auth-hint" style={{ marginTop: 8 }}>
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
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
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
        <div style={{ marginTop: 12 }}>
          <div className="tvp-muted" style={{ fontSize: 13 }}>
            Add an extra sign-in step using a time-based code from an authenticator
            app on your phone. Recommended for all administrators.
          </div>
          {error && (
            <div className="tv-form-alert tv-form-alert-error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
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
        <div className="tv-form-alert tv-form-alert-info" style={{ marginTop: 12 }}>
          {info}
        </div>
      )}
    </div>
  );
}
