import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mail, ShieldCheck, KeyRound } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { logMfaEnrolled } from "@/lib/admin.functions";
import { friendlyAuthError } from "@/lib/password";
import { resolvePortalHome } from "@/lib/portal-access";
import {
  bypassSignInVerification,
  getMfaStatus,
  markMfaExplainerSeen,
  requestSignInCode,
  verifySignInCode,
} from "@/lib/mfa.functions";
import { browserSessionId } from "@/lib/device";
// TESTING ONLY — remove before launch
import { MFA_CODE_BYPASS_FOR_TESTING } from "@/lib/mfa-bypass";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/enroll-2fa")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Set up two-step sign-in · TalVault" },
      {
        name: "description",
        content:
          "Two-step sign-in is required on every TalVault account. We email you a short code each time you sign in.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EnrollTwoFactorPage,
});

function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

function portalLabel(next?: string) {
  const p = safeNext(next) ?? "";
  if (p.startsWith("/agency")) return "AGENCY PORTAL";
  if (p.startsWith("/talent")) return "TALENT PORTAL";
  if (p.startsWith("/admin")) return "ADMIN PORTAL";
  return "TALVAULT PLATFORM";
}

function EnrollTwoFactorPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/enroll-2fa" });

  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  /** "explainer" is only ever shown once per account. */
  const [step, setStep] = useState<"explainer" | "code">("explainer");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const goHome = async () => {
    const dest = safeNext(search.next) ?? (await resolvePortalHome());
    navigate({ to: (dest ?? "/auth") as never, replace: true });
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        if (!user) {
          navigate({ to: "/auth", search: { next: search.next } as never, replace: true });
          return;
        }
        setEmail(user.email ?? "");
        const status = await getMfaStatus({ data: { device: browserSessionId() } });
        if (status.gate === "ok") {
          await goHome();
          return;
        }
        // Someone who has already read the explainer goes straight to the code.
        if (status.explainerSeen) setStep("code");
      } catch (e) {
        setError(friendlyAuthError(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCode = async (firstTime: boolean) => {
    setError(null);
    setSending(true);
    try {
      if (firstTime) await markMfaExplainerSeen().catch(() => {});
      const res = await requestSignInCode();
      if (!res.ok) {
        setError(res.message);
        if (firstTime) setStep("code");
        return;
      }
      setSentTo(res.destination);
      setStep("code");
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setSending(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await verifySignInCode({
        data: { code: code.trim(), device: browserSessionId() },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // Audit entry is admin-scoped; harmless (and expected) to fail for others.
      try {
        await logMfaEnrolled({ data: { factor_type: "email_code" } });
      } catch {
        /* not an administrator — no admin audit entry */
      }
      toast.success("Two-step sign-in is now set up.");
      await goHome();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  /** TESTING ONLY — remove with MFA_CODE_BYPASS_FOR_TESTING before launch. */
  const skipVerification = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await bypassSignInVerification({ data: { device: browserSessionId() } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      await goHome();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="tv-auth">
      <aside className="tv-auth-hero">
        <div className="tv-auth-brand">
          <div className="tv-auth-mark">
            <TalVaultIcon variant="white" style={{ height: 24, width: 24 }} />
          </div>
          <div>
            <TalVaultWordmark variant="white" style={{ height: 20 }} />
            <div className="tv-auth-brand-sub">{portalLabel(search.next)}</div>
          </div>
        </div>

        <div>
          <h1 className="tv-auth-headline">One more step before your workspace opens.</h1>
          <p className="tv-auth-sub">
            TalVault holds sensitive personal and financial records, so a password
            on its own isn't enough. From now on we'll also email you a short code
            when you sign in. It takes under a minute to set up.
          </p>

          <ul className="tv-auth-points">
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <Mail className="h-4 w-4 text-white" />
              </span>
              We email a 6-digit code to your own address
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <KeyRound className="h-4 w-4 text-white" />
              </span>
              You type it in to finish signing in
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <ShieldCheck className="h-4 w-4 text-white" />
              </span>
              Nobody can get in with your password alone
            </li>
          </ul>
        </div>

        <div className="tv-auth-footnote">TalVault Platform</div>
      </aside>

      <section className="tv-auth-panel">
        <div className="tv-auth-card">
          <div className="tv-auth-eyebrow">Security setup</div>
          <h2 className="tv-auth-title">
            {step === "explainer" ? "Set up two-step sign-in" : "Enter your sign-in code"}
          </h2>
          <p className="tv-auth-tag">
            {email
              ? `Signed in as ${email}. You can't open your workspace until this is set up.`
              : "You can't open your workspace until this is set up."}
          </p>

          {loading ? (
            <div className="tv-auth-hint" style={{ marginTop: 22 }}>
              Checking your account…
            </div>
          ) : step === "explainer" ? (
            <div style={{ marginTop: 20 }}>
              <div className="tv-auth-hint">
                <strong>What is this?</strong> Two-step sign-in means your password
                is only half of what's needed to open your account. The other half
                is a short number we send you at the moment you sign in.
              </div>
              <div className="tv-auth-hint" style={{ marginTop: 12 }}>
                <strong>Why do we require it?</strong> Your vault holds identity
                documents, contracts and financial records. If someone ever learned
                your password, this second step still keeps them out.
              </div>
              <div className="tv-auth-hint" style={{ marginTop: 12 }}>
                <strong>How does it work?</strong> Each time you sign in we email a
                6-digit code to{" "}
                <strong>{email || "your email address"}</strong>. You type it into
                the box on the sign-in page. The code lasts 10 minutes and works
                once. There's nothing to install and nothing to remember.
              </div>

              {error && <div className="tv-auth-alert">{error}</div>}

              <button
                type="button"
                className="tv-auth-submit"
                onClick={() => sendCode(true)}
                disabled={sending}
              >
                {sending ? "Sending your code…" : "Email me a code to get started"}
              </button>

              <div className="tv-auth-switch">
                Not your account?{" "}
                <button type="button" className="tv-auth-link" onClick={signOut} disabled={sending}>
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={verify} style={{ marginTop: 20 }} noValidate>
              <div className="tv-auth-hint">
                {sentTo
                  ? `We've emailed a 6-digit code to ${sentTo}. It expires in 10 minutes and can only be used once.`
                  : "Enter the 6-digit code we emailed you. It expires in 10 minutes and can only be used once."}
              </div>

              <div className="tv-auth-field">
                <label htmlFor="mfa-enroll-code">Sign-in code</label>
                <input
                  id="mfa-enroll-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  autoFocus
                />
                <div className="tv-auth-hint">
                  Can't see it? Check your junk or spam folder.
                </div>
              </div>

              {error && <div className="tv-auth-alert">{error}</div>}

              <button
                type="submit"
                className="tv-auth-submit"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Verifying…" : "Verify & finish set-up"}
              </button>

              <div className="tv-auth-switch" style={{ display: "flex", gap: 14 }}>
                <button
                  type="button"
                  className="tv-auth-link"
                  onClick={() => sendCode(false)}
                  disabled={sending || busy}
                >
                  {sending ? "Sending…" : "Send a new code"}
                </button>
                <button type="button" className="tv-auth-link" onClick={signOut} disabled={busy}>
                  Sign out
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
