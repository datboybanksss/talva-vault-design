import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, Lock, FolderLock, Sparkles, Users, Check, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/password-input";
import { TwoFactorCard } from "@/components/account/two-factor-card";
import {
  MIN_PW_LENGTH,
  PW_POLICY_HINT,
  checkRequirements,
  scorePassword,
  validateNewPassword,
  friendlyAuthError,
} from "@/lib/password";
import {
  resolveTalentInvitationToken,
  activateTalentInvitation,
  type ResolvedTalentInvitation,
} from "@/lib/talent-activation.functions";
import {
  InviteAccountGatePanel,
  useInviteAccountGate,
} from "@/components/shared/invite-account-gate";

export const Route = createFileRoute("/invite/talent/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activate your Talent vault · TalVault" },
      { name: "description", content: "Accept your TalVault talent invitation and set up your secure vault." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TalentInvitePage,
});

function TalentInvitePage() {
  const { token } = Route.useParams();
  const nav = useNavigate();


  const inviteQ = useQuery({
    queryKey: ["talent-invite-token", token],
    queryFn: () => resolveTalentInvitationToken({ data: { token } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  // Snapshot the first successful resolve. Completing the wizard signs the
  // user in, which invalidates queries — a refetch would then report the token
  // as "accepted" and blow the user out of step 4.
  const [snapshot, setSnapshot] = useState<Extract<ResolvedTalentInvitation, { ok: true }> | null>(null);
  const resolved = inviteQ.data;
  useEffect(() => {
    if (resolved && resolved.ok) setSnapshot((prev) => prev ?? resolved);
  }, [resolved]);

  const invite = snapshot ?? (resolved && resolved.ok ? resolved : null);

  return (
    <div className="tv-auth">
      <BrandingPanel />
      <section className="tv-auth-panel">
        <div className="tv-auth-card" style={{ maxWidth: 520 }}>
          {invite ? (
            <InviteBody invite={invite} token={token} onDone={() => nav({ to: "/talent" })} />
          ) : inviteQ.isLoading ? (
            <div className="tv-auth-tag">Loading your invitation…</div>
          ) : !resolved ? (
            <TerminalError title="Something went wrong" body="We couldn't load this invitation. Please try again or contact your Manager." />
          ) : resolved.ok === false ? (
            <TerminalError title={terminalTitle(resolved.reason)} body={terminalBody(resolved.reason)} />
          ) : null}


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
  invite: Extract<ResolvedTalentInvitation, { ok: true }>;
  token: string;
  onDone: () => void;
}) {
  const gate = useInviteAccountGate({ token, kind: "talent", invitedEmail: invite.email });

  if (gate.state !== "new-account") {
    return (
      <InviteAccountGatePanel
        eyebrow="Talent Activation"
        token={token}
        kind="talent"
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


type Reason = Exclude<ResolvedTalentInvitation, { ok: true }>["reason"];

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
    case "expired": return "Contact your Manager to receive a fresh invitation link.";
    case "accepted": return "This invitation has already been used. Sign in to your account instead.";
    case "revoked": return "This invitation has been withdrawn. Contact your Manager for a new one.";
    case "throttled": return "We've paused this link for a few minutes after too many attempts. Please wait and try again, or contact your Manager.";
    default: return "The link you followed doesn't match any active invitation. Double-check the URL or contact your Manager.";
  }
}

function TerminalError({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="tv-auth-eyebrow">Talent Activation</div>
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
  invite: Extract<ResolvedTalentInvitation, { ok: true }>;
  token: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<StepKey>(1);
  const [fullName, setFullName] = useState(invite.talent_name ?? "");
  const [idNumber, setIdNumber] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [provisional, setProvisional] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);
  const req = useMemo(() => checkRequirements(password), [password]);

  const activate = useMutation({
    mutationFn: () =>
      activateTalentInvitation({
        data: {
          token,
          email: invite.email,
          full_name: fullName.trim(),
          id_number: idNumber.trim() || undefined,
          date_of_birth: dob || undefined,
          tax_number: taxNumber.trim() || undefined,
          is_provisional_taxpayer: provisional,
          phone_number: phone.trim() || undefined,
          password,
          terms_accepted: true as const,
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: res.email, password });
      if (error) {
        setError(friendlyAuthError(error));
        return;
      }
      setStep(4);
    },
    onError: (e: any) => setError(e?.message ?? "Activation failed."),
  });

  const goNext = () => {
    setError(null);
    if (step === 2) {
      if (fullName.trim().length < 2) {
        setError("Please enter your full name (min 2 characters).");
        return;
      }
    }
    if (step === 3) {
      const v = validateNewPassword(password);
      if (v) { setError(v); return; }
      if (password !== confirmPw) { setError("Passwords do not match."); return; }
      if (!terms) { setError("You must accept the Terms & Conditions to continue."); return; }
      activate.mutate();
      return;
    }
    setStep((s) => (s < 4 ? ((s + 1) as StepKey) : s));
  };
  const goBack = () => { setError(null); setStep((s) => (s > 1 ? ((s - 1) as StepKey) : s)); };

  return (
    <>
      <ProgressBar step={step} />
      <div className="tv-auth-eyebrow" style={{ marginTop: 4 }}>Talent Activation · Step {step} of 4</div>

      {step === 1 && <Step1 invite={invite} onContinue={goNext} />}
      {step === 2 && (
        <Step2
          fullName={fullName} setFullName={setFullName}
          idNumber={idNumber} setIdNumber={setIdNumber}
          dob={dob} setDob={setDob}
          phone={phone} setPhone={setPhone}
          taxNumber={taxNumber} setTaxNumber={setTaxNumber}
          provisional={provisional} setProvisional={setProvisional}
          onBack={goBack} onContinue={goNext} error={error}
        />
      )}
      {step === 3 && (
        <Step3
          password={password} setPassword={setPassword}
          confirmPw={confirmPw} setConfirmPw={setConfirmPw}
          strength={strength} req={req}
          terms={terms} setTerms={setTerms}
          onBack={goBack} onContinue={goNext}
          busy={activate.isPending} error={error}
        />
      )}
      {step === 4 && <Step4 email={invite.email} onDone={onDone} />}
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
}: { invite: Extract<ResolvedTalentInvitation, { ok: true }>; onContinue: () => void }) {
  return (
    <>
      <h2 className="tv-auth-title">Accept Talent Invite</h2>
      <p className="tv-auth-tag">
        You've been invited by <strong>{invite.agency_name}</strong>.
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
        Email must match the invite. You must register with the same email address your Manager sent the invitation to.
      </div>
      <button type="button" className="tv-auth-submit" onClick={onContinue}>
        Continue
      </button>
    </>
  );
}

function Step2({
  fullName, setFullName, idNumber, setIdNumber, dob, setDob, phone, setPhone,
  taxNumber, setTaxNumber, provisional, setProvisional, onBack, onContinue, error,
}: {
  fullName: string; setFullName: (v: string) => void;
  idNumber: string; setIdNumber: (v: string) => void;
  dob: string; setDob: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  taxNumber: string; setTaxNumber: (v: string) => void;
  provisional: boolean; setProvisional: (v: boolean) => void;
  onBack: () => void; onContinue: () => void; error: string | null;
}) {
  return (
    <>
      <h2 className="tv-auth-title">Confirm your details</h2>
      <p className="tv-auth-tag">
        These details stay in your Private Vault. Your Manager cannot see them unless you share a document.
      </p>
      <div className="tv-auth-field">
        <label htmlFor="full-name">Full name</label>
        <input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aisha Mokoena" autoFocus />
      </div>
      <div className="tv-auth-field">
        <label htmlFor="id-number">ID / Passport number</label>
        <input id="id-number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. 9001015800086" />
      </div>
      <div className="tv-auth-field">
        <label htmlFor="dob">Date of birth</label>
        <input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </div>
      <div className="tv-auth-field">
        <label htmlFor="phone">Phone (optional)</label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 71 234 5678" autoComplete="tel" />
      </div>
      <div className="tv-auth-field">
        <label htmlFor="tax-number">Tax reference number (optional)</label>
        <input id="tax-number" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="SARS tax number" />
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 4, cursor: "pointer", fontSize: 14 }}>
        <input
          type="checkbox"
          checked={provisional}
          onChange={(e) => setProvisional(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16 }}
        />
        <span>I am a registered provisional taxpayer.</span>
      </label>
      {error && <div className="tv-auth-alert" style={{ marginTop: 12 }}>{error}</div>}
      <StepButtons onBack={onBack} onContinue={onContinue} />
    </>
  );
}

function Step3({
  password, setPassword, confirmPw, setConfirmPw, strength, req, terms, setTerms, onBack, onContinue, busy, error,
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
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 4, cursor: "pointer", fontSize: 14 }}>
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16 }}
        />
        <span>
          I have read and accept the{" "}
          <a href="/legal/terms" target="_blank" rel="noreferrer" className="tv-auth-link">Terms &amp; Conditions</a> and{" "}
          <a href="/legal/privacy" target="_blank" rel="noreferrer" className="tv-auth-link">Privacy Policy</a>.
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
          onClick={onContinue}
          disabled={busy}
          style={{ flex: 1, marginTop: 0, height: 46 }}
        >
          {busy ? "Creating your vault…" : "Create account"}
        </button>
      </div>
    </>
  );
}

function Step4({ email, onDone }: { email: string; onDone: () => void }) {
  const noop = async () => undefined;
  return (
    <>
      <h2 className="tv-auth-title">Secure your vault with 2FA</h2>
      <p className="tv-auth-tag">
        Two-factor authentication adds a second check when you sign in, so your documents stay safe even if
        someone learns your password. You can set this up now or later from Settings.
      </p>
      <div className="tv-app tv-app-embed" style={{ marginTop: 8 }}>
        <TwoFactorCard email={email} logEnrolled={noop} logDisabled={noop} contextLabel="talent" />
      </div>

      <button
        type="button"
        className="tv-auth-submit"
        onClick={onDone}
        style={{ marginTop: 20, height: 46, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <Check className="h-4 w-4" />
        <span>Go to my vault</span>
      </button>
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
          <div className="tv-auth-brand-sub">TALENT</div>
        </div>
      </div>
      <div>
        <h1 className="tv-auth-headline">Activate your Talent vault</h1>
        <p className="tv-auth-sub">
          Set up your account and enter a secure workspace with a Private Vault, Agency Shared Folder and
          Loved One sharing.
        </p>
        <ul className="tv-auth-points">
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><Lock className="h-4 w-4 text-white" /></span>Private Vault</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><FolderLock className="h-4 w-4 text-white" /></span>Agency Shared Folder</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><Sparkles className="h-4 w-4 text-white" /></span>AI review</li>
          <li className="tv-auth-point"><span className="tv-auth-point-dot"><Users className="h-4 w-4 text-white" /></span>Loved One access</li>
        </ul>
      </div>
      <div className="tv-auth-footnote">Private Vault · Shared Folder · AI review · Loved One access</div>
    </aside>
  );
}
