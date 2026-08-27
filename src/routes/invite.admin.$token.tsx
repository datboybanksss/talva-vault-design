import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, ScrollText, FileText, Bell, Check, ArrowLeft, Info } from "lucide-react";
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
import { permissionLabel } from "@/lib/invitation-email";
import {
  resolveAdminInvitationToken,
  activateAdminInvitation,
  type ResolvedAdminInvitation,
} from "@/lib/admin-activation.functions";
import {
  InviteAccountGatePanel,
  useInviteAccountGate,
} from "@/components/shared/invite-account-gate";

export const Route = createFileRoute("/invite/admin/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activate your Administrator account · TalVault" },
      { name: "description", content: "Accept your TalVault administrator invitation and set up your account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminInvitePage,
});

function AdminInvitePage() {
  const { token } = Route.useParams();
  const nav = useNavigate();

  const inviteQ = useQuery({
    queryKey: ["admin-invite-token", token],
    queryFn: () => resolveAdminInvitationToken({ data: { token } }),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="tv-auth tv-auth--invite">
      <BrandingPanel />
      <section className="tv-auth-panel">
        <div className="tv-auth-card" style={{ maxWidth: 520 }}>
          {inviteQ.isLoading ? (
            <div className="tv-auth-tag">Loading your invitation…</div>
          ) : !inviteQ.data ? (
            <TerminalError title="Something went wrong" body="We couldn't load this invitation. Please try again or contact the Main Administrator." />
          ) : inviteQ.data.ok === false ? (
            <TerminalError title={terminalTitle(inviteQ.data.reason)} body={terminalBody(inviteQ.data.reason)} />
          ) : (
            <InviteBody invite={inviteQ.data} token={token} onDone={() => nav({ to: "/admin" })} />
          )}
        </div>
      </section>
    </div>
  );
}

function InviteBody({
  invite,
  token,
  onDone,
}: {
  invite: Extract<ResolvedAdminInvitation, { ok: true }>;
  token: string;
  onDone: () => void;
}) {
  const gate = useInviteAccountGate({ token, kind: "admin", invitedEmail: invite.email });

  if (gate.state !== "new-account") {
    return (
      <InviteAccountGatePanel
        eyebrow="Administrator Activation"
        token={token}
        kind="admin"
        invitedEmail={invite.email}
        state={gate.state}
        signedInEmail={gate.signedInEmail}
        error={gate.error}
        onUseDifferentAccount={async () => {
          await supabase.auth.signOut();
          gate.setState("new-account");
        }}
      />
    );
  }

  return <Wizard invite={invite} token={token} onDone={onDone} />;
}


type Reason = Exclude<ResolvedAdminInvitation, { ok: true }>["reason"];

function terminalTitle(reason: Reason): string {
  switch (reason) {
    case "expired": return "This invitation has expired";
    case "accepted": return "Invitation already accepted";
    case "revoked": return "Invitation revoked";
    case "throttled": return "Too many attempts";
    default: return "Invitation not found";
  }
}
function terminalBody(reason: Reason): string {
  switch (reason) {
    case "expired": return "Contact the Main Administrator to receive a fresh invitation link.";
    case "accepted": return "This invitation has already been used. Sign in to your account instead.";
    case "revoked": return "This invitation has been withdrawn. Contact the Main Administrator for a new one.";
    case "throttled": return "We've paused this link for a few minutes after too many attempts. Please wait and try again, or contact the Main Administrator.";
    default: return "The link you followed doesn't match any active invitation. Double-check the URL or contact the Main Administrator.";
  }
}

function TerminalError({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="tv-auth-eyebrow">Administrator Activation</div>
      <h2 className="tv-auth-title">{title}</h2>
      <p className="tv-auth-tag">{body}</p>
      <div className="tv-auth-back" style={{ marginTop: 24 }}>
        <Link to="/auth" className="tv-auth-link">Go to sign in →</Link>
      </div>
    </>
  );
}

/* --------------------------------- Wizard --------------------------------- */

type StepKey = 1 | 2 | 3 | 4;

function Wizard({
  invite,
  token,
  onDone,
}: {
  invite: Extract<ResolvedAdminInvitation, { ok: true }>;
  token: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<StepKey>(1);
  const [displayName, setDisplayName] = useState("");
  const [designation, setDesignation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);
  const req = useMemo(() => checkRequirements(password), [password]);

  const activate = useMutation({
    mutationFn: () =>
      activateAdminInvitation({
        data: {
          token,
          email: invite.email,
          display_name: displayName.trim(),
          designation: designation.trim() || undefined,
          password,
          terms_accepted: true as const,
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: res.email,
        password,
      });
      if (error) {
        setError(friendlyAuthError(error));
        return;
      }
      // The /admin route's own beforeLoad enforcement redirects to
      // /admin/enroll-2fa on first sign-in, so no 2FA step belongs here.
      onDone();
    },
    onError: (e: any) => setError(e?.message ?? "Activation failed."),
  });

  const goNext = () => {
    setError(null);
    if (step === 2) {
      if (displayName.trim().length < 2) {
        setError("Please enter your full name (min 2 characters).");
        return;
      }
    }
    if (step === 3) {
      const v = validateNewPassword(password);
      if (v) { setError(v); return; }
      if (password !== confirmPw) { setError("Passwords do not match."); return; }
    }
    setStep((s) => (s < 4 ? ((s + 1) as StepKey) : s));
  };
  const goBack = () => { setError(null); setStep((s) => (s > 1 ? ((s - 1) as StepKey) : s)); };

  const submit = () => {
    setError(null);
    if (!terms) { setError("You must accept the Terms & Conditions to continue."); return; }
    activate.mutate();
  };

  return (
    <>
      <ProgressBar step={step} />
      <div className="tv-auth-eyebrow" style={{ marginTop: 4 }}>Administrator Activation · Step {step} of 4</div>

      {step === 1 && <Step1 invite={invite} onContinue={goNext} />}
      {step === 2 && (
        <Step2
          displayName={displayName}
          setDisplayName={setDisplayName}
          designation={designation}
          setDesignation={setDesignation}
          onBack={goBack}
          onContinue={goNext}
          error={error}
        />
      )}
      {step === 3 && (
        <Step3
          password={password}
          setPassword={setPassword}
          confirmPw={confirmPw}
          setConfirmPw={setConfirmPw}
          strength={strength}
          req={req}
          onBack={goBack}
          onContinue={goNext}
          error={error}
        />
      )}
      {step === 4 && (
        <Step4
          terms={terms}
          setTerms={setTerms}
          onBack={goBack}
          onSubmit={submit}
          busy={activate.isPending}
          error={error}
        />
      )}
    </>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          style={{
            flex: 1,
            height: 6,
            borderRadius: "var(--radius-sm)",
            background: n <= step ? "var(--teal)" : "var(--line)",
            transition: "background 200ms ease",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------- Steps ------------------------------------ */

function Step1({
  invite, onContinue,
}: { invite: Extract<ResolvedAdminInvitation, { ok: true }>; onContinue: () => void }) {
  return (
    <>
      <h2 className="tv-auth-title">Accept Administrator Invite</h2>
      <p className="tv-auth-tag">
        You've been invited to administer TalVault with{" "}
        <strong style={{ color: "var(--ink-900)" }}>{permissionLabel(invite.permission_level)}</strong> access.
      </p>
      <div className="tv-auth-field" style={{ marginTop: 20 }}>
        <label htmlFor="invited-email" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          Email address used for invite
        </label>
        <input
          id="invited-email"
          type="email"
          value={invite.email}
          readOnly
          disabled
          aria-readonly="true"
          style={{ background: "var(--surface-soft)", color: "var(--ink-900)", cursor: "not-allowed" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          background: "var(--st-info-bg)",
          color: "var(--st-info-fg)",
          padding: "12px 14px",
          borderRadius: "var(--r-sm)",
          marginTop: 12,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <Info className="h-4 w-4" style={{ flex: "0 0 auto", marginTop: 2 }} aria-hidden="true" />
        <p style={{ margin: 0 }}>
          <strong>Email must match the invite.</strong>{" "}
          <span style={{ color: "var(--ink-500)" }}>
            You must register with the same email address used in the invitation.
          </span>
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button
          type="button"
          className="tv-auth-submit"
          onClick={onContinue}
          style={{ width: "auto", marginTop: 0, padding: "0 28px", height: 46, borderRadius: "var(--r-sm)" }}
        >
          Continue
        </button>
      </div>
    </>
  );
}

function Step2({
  displayName, setDisplayName, designation, setDesignation, onBack, onContinue, error,
}: {
  displayName: string; setDisplayName: (v: string) => void;
  designation: string; setDesignation: (v: string) => void;
  onBack: () => void; onContinue: () => void; error: string | null;
}) {
  return (
    <>
      <h2 className="tv-auth-title">Confirm your details</h2>
      <p className="tv-auth-tag">Tell us who you are. You can update this later from My Account.</p>
      <div className="tv-auth-field">
        <label htmlFor="name">Full name</label>
        <input
          id="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Aisha Mokoena"
          autoFocus
        />
      </div>
      <div className="tv-auth-field">
        <label htmlFor="designation">Designation (optional)</label>
        <input
          id="designation"
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="e.g. Compliance Officer"
        />
      </div>
      {error && <div className="tv-auth-alert">{error}</div>}
      <StepButtons onBack={onBack} onContinue={onContinue} />
    </>
  );
}

function Step3({
  password, setPassword, confirmPw, setConfirmPw, strength, req, onBack, onContinue, error,
}: any) {
  return (
    <>
      <h2 className="tv-auth-title">Create your password</h2>
      <p className="tv-auth-tag">Choose a strong password. You'll use this to sign in from now on.</p>
      <div className="tv-auth-field">
        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder={`At least ${MIN_PW_LENGTH} characters`}
          minLength={MIN_PW_LENGTH}
        />
        <div className="tv-auth-hint">{PW_POLICY_HINT}</div>
        {password.length > 0 && (
          <>
            <ul className="tv-auth-reqs" aria-live="polite">
              <li className={req.length ? "ok" : ""}>{req.length ? "✓" : "•"} At least {MIN_PW_LENGTH} characters</li>
              <li className={req.upper ? "ok" : ""}>{req.upper ? "✓" : "•"} An uppercase letter</li>
              <li className={req.lower ? "ok" : ""}>{req.lower ? "✓" : "•"} A lowercase letter</li>
              <li className={req.number ? "ok" : ""}>{req.number ? "✓" : "•"} A number</li>
              <li className={req.special ? "ok" : ""}>{req.special ? "✓" : "•"} A special character</li>
            </ul>
            <div className="tv-auth-strength" aria-live="polite">
              <div className="tv-auth-strength-bar">
                <div className="tv-auth-strength-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
              </div>
              <div className="tv-auth-strength-row">
                <span className="tv-auth-strength-label">Strength</span>
                <span className={`tv-auth-strength-value ${strength.tier}`}>{strength.label}</span>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="tv-auth-field">
        <label htmlFor="confirm">Confirm password</label>
        <PasswordInput
          id="confirm"
          value={confirmPw}
          onChange={setConfirmPw}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          minLength={MIN_PW_LENGTH}
        />
      </div>
      {error && <div className="tv-auth-alert">{error}</div>}
      <StepButtons onBack={onBack} onContinue={onContinue} />
    </>
  );
}

function Step4({
  terms, setTerms, onBack, onSubmit, busy, error,
}: {
  terms: boolean; setTerms: (v: boolean) => void;
  onBack: () => void; onSubmit: () => void; busy: boolean; error: string | null;
}) {
  return (
    <>
      <h2 className="tv-auth-title">Terms &amp; Conditions</h2>
      <p className="tv-auth-tag">
        Please review and accept our terms to complete your administrator setup.
      </p>
      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: "var(--radius)",
          border: "1px solid var(--line)",
          maxHeight: 200,
          overflowY: "auto",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--muted-fg)",
          background: "var(--surface-soft)",
        }}
      >
        <p><strong>TalVault Administrator Terms of Service (Summary)</strong></p>
        <p>As a TalVault administrator you agree to access agency and talent data only for legitimate platform administration, to respect the permission level assigned to your account, and to keep your credentials confidential.</p>
        <p>You acknowledge that all administrator actions are audit logged and that this log is reviewable at any time.</p>
      </div>
      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          marginTop: 16,
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16 }}
        />
        <span>
          I have read and accept the <a href="/legal/terms" target="_blank" rel="noreferrer" className="tv-auth-link">Terms &amp; Conditions</a> and <a href="/legal/privacy" target="_blank" rel="noreferrer" className="tv-auth-link">Privacy Policy</a>.
        </span>
      </label>
      {error && <div className="tv-auth-alert" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "stretch" }}>
        <button
          type="button"
          className="tv-auth-google"
          onClick={onBack}
          disabled={busy}
          style={{ width: "auto", flex: "0 0 auto", padding: "0 18px", height: 46 }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          className="tv-auth-submit"
          onClick={onSubmit}
          disabled={!terms || busy}
          style={{ flex: 1, marginTop: 0, height: 46, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {busy ? (
            "Setting up your account…"
          ) : (
            <>
              <Check className="h-4 w-4" />
              <span>Complete setup</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}

function StepButtons({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "stretch" }}>
      <button
        type="button"
        className="tv-auth-google"
        onClick={onBack}
        style={{ width: "auto", flex: "0 0 auto", padding: "0 18px", height: 46 }}
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button type="button" className="tv-auth-submit" onClick={onContinue} style={{ flex: 1, marginTop: 0, height: 46 }}>
        Continue
      </button>
    </div>
  );
}

/* ----------------------------- Branding panel ----------------------------- */

function BrandingPanel() {
  return (
    <aside className="tv-auth-hero">
      <div className="tv-auth-brand">
        <div className="tv-auth-mark"><TalVaultIcon variant="white" style={{ height: 24, width: 24 }} /></div>
        <div>
          <TalVaultWordmark variant="white" style={{ height: 20 }} />
          <div className="tv-auth-brand-sub">ADMINISTRATOR</div>
        </div>
      </div>
      <div>
        <h1 className="tv-auth-headline">Set up your Administrator account</h1>
        <p className="tv-auth-sub">
          Accept your invite, confirm your details and create a password to access
          the TalVault control centre.
        </p>
        <ul className="tv-auth-points">
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><ShieldCheck className="h-4 w-4 text-white" /></span>Agency oversight</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><ScrollText className="h-4 w-4 text-white" /></span>Compliance &amp; audit log</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><FileText className="h-4 w-4 text-white" /></span>Quotes &amp; invoicing reports</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><Bell className="h-4 w-4 text-white" /></span>Platform-wide notifications</li>
        </ul>
      </div>
      <div className="tv-auth-footnote">TalVault Platform</div>
    </aside>
  );
}
