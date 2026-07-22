import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, Lock, FolderLock, FileText, Users, Check, ArrowLeft } from "lucide-react";
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
import {
  resolveAgencyInvitationToken,
  activateAgencyInvitation,
  type ResolvedInvitation,
} from "@/lib/agency-activation.functions";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activate your Agency workspace · TalVault" },
      { name: "description", content: "Accept your TalVault agency invitation and set up your workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const nav = useNavigate();

  // Sign out any pre-existing session so the wizard runs cleanly.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.auth.signOut();
    })();
  }, []);

  const inviteQ = useQuery({
    queryKey: ["agency-invite-token", token],
    queryFn: () => resolveAgencyInvitationToken({ data: { token } }),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="tv-auth">
      <BrandingPanel />
      <section className="tv-auth-panel">
        <div className="tv-auth-card" style={{ maxWidth: 520 }}>
          {inviteQ.isLoading ? (
            <div className="tv-auth-tag">Loading your invitation…</div>
          ) : !inviteQ.data ? (
            <TerminalError title="Something went wrong" body="We couldn't load this invitation. Please try again or contact your administrator." />
          ) : inviteQ.data.ok === false ? (
            <TerminalError title={terminalTitle(inviteQ.data.reason)} body={terminalBody(inviteQ.data.reason)} />
          ) : (
            <Wizard invite={inviteQ.data} token={token} onDone={() => nav({ to: "/agency" })} />
          )}
        </div>
      </section>
    </div>
  );
}

function terminalTitle(reason: Exclude<ResolvedInvitation, { ok: true }>["reason"]): string {
  switch (reason) {
    case "expired": return "This invitation has expired";
    case "accepted": return "Invitation already accepted";
    case "revoked": return "Invitation revoked";
    case "unsupported": return "Unsupported invitation";
    default: return "Invitation not found";
  }
}
function terminalBody(reason: Exclude<ResolvedInvitation, { ok: true }>["reason"]): string {
  switch (reason) {
    case "expired": return "Contact your TalVault administrator to receive a fresh invitation link.";
    case "accepted": return "This invitation has already been used. Sign in to your account instead.";
    case "revoked": return "This invitation has been withdrawn. Contact your administrator for a new one.";
    case "unsupported": return "This link isn't handled by the Agency Activation flow.";
    default: return "The link you followed doesn't match any active invitation. Double-check the URL or contact your administrator.";
  }
}

function TerminalError({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="tv-auth-eyebrow">Agency Activation</div>
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
  invite: Extract<ResolvedInvitation, { ok: true }>;
  token: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<StepKey>(1);
  const [displayName, setDisplayName] = useState(invite.contact_person ?? "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);
  const req = useMemo(() => checkRequirements(password), [password]);

  const activate = useMutation({
    mutationFn: () =>
      activateAgencyInvitation({
        data: {
          token,
          email: invite.email,
          display_name: displayName.trim(),
          phone: phone.trim() || undefined,
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
      <div className="tv-auth-eyebrow" style={{ marginTop: 4 }}>Agency Activation · Step {step} of 4</div>

      {step === 1 && (
        <Step1
          invite={invite}
          onContinue={goNext}
        />
      )}
      {step === 2 && (
        <Step2
          displayName={displayName}
          setDisplayName={setDisplayName}
          phone={phone}
          setPhone={setPhone}
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
          agencyName={invite.agency_name}
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

function Step1({ invite, onContinue }: { invite: Extract<ResolvedInvitation, { ok: true }>; onContinue: () => void }) {
  return (
    <>
      <h2 className="tv-auth-title">Accept Agency Invite</h2>
      <p className="tv-auth-tag">
        You've been invited to activate the workspace for <strong>{invite.agency_name}</strong>.
        {invite.kind === "staff" && invite.role ? <> Role: <strong>{invite.role}</strong>.</> : null}
      </p>
      <div className="tv-auth-field" style={{ marginTop: 20 }}>
        <label htmlFor="invited-email">Email address used for invite</label>
        <input
          id="invited-email"
          type="email"
          value={invite.email}
          readOnly
          aria-readonly="true"
          style={{ background: "var(--surface-soft)", cursor: "not-allowed" }}
        />
      </div>
      <div
        className="tv-auth-hint"
        style={{
          background: "var(--teal-50)",
          border: "1px solid var(--teal-200)",
          color: "var(--teal)",
          padding: "10px 12px",
          borderRadius: "var(--radius)",
          marginTop: 8,
        }}
      >
        Email must match the invite. The Agency user must register with the same email address used in the invitation.
      </div>
      <button type="button" className="tv-auth-submit" onClick={onContinue}>
        Continue
      </button>
    </>
  );
}

function Step2({
  displayName, setDisplayName, phone, setPhone, onBack, onContinue, error,
}: {
  displayName: string; setDisplayName: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  onBack: () => void; onContinue: () => void; error: string | null;
}) {
  return (
    <>
      <h2 className="tv-auth-title">Confirm your details</h2>
      <p className="tv-auth-tag">Tell us who you are. You can update this later from Account Settings.</p>
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
        <label htmlFor="phone">Phone (optional)</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+27 71 234 5678"
          autoComplete="tel"
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
  agencyName, terms, setTerms, onBack, onSubmit, busy, error,
}: {
  agencyName: string;
  terms: boolean; setTerms: (v: boolean) => void;
  onBack: () => void; onSubmit: () => void; busy: boolean; error: string | null;
}) {
  return (
    <>
      <h2 className="tv-auth-title">Terms &amp; Conditions</h2>
      <p className="tv-auth-tag">
        Please review and accept our terms to complete setup for <strong>{agencyName}</strong>.
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
        <p><strong>TalVault Manager Terms of Service (Summary)</strong></p>
        <p>By activating this workspace you agree to safeguard talent data, respect retention policies configured by administrators, and use the platform only for legitimate agency operations. Full terms and our Privacy Policy govern your use of TalVault.</p>
        <p>You acknowledge that all actions are audit logged, that document retention locks are legally binding, and that account credentials must not be shared.</p>
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
            "Setting up your workspace…"
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
        <div className="tv-auth-mark"><ShieldCheck className="h-6 w-6 text-white" /></div>
        <div>
          <div className="tv-auth-brand-title">TalVault</div>
          <div className="tv-auth-brand-sub">AGENCY PORTAL</div>
        </div>
      </div>
      <div>
        <h1 className="tv-auth-headline">Set up your Agency workspace</h1>
        <p className="tv-auth-sub">
          Accept your invite, confirm your details, create a password and complete
          your Agency setup before entering the portal.
        </p>
        <ul className="tv-auth-points">
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><Lock className="h-4 w-4 text-white" /></span>Secure onboarding</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><FolderLock className="h-4 w-4 text-white" /></span>Agency Shared Folders</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><FileText className="h-4 w-4 text-white" /></span>Quotes &amp; Invoices</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><Users className="h-4 w-4 text-white" /></span>Talent invitations</li>
        </ul>
      </div>
      <div className="tv-auth-footnote">TalVault Platform</div>
    </aside>
  );
}
