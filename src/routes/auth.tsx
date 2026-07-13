import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ShieldCheck, Lock, FileCheck2, Users } from "lucide-react";
import { z } from "zod";
import { PasswordInput } from "@/components/password-input";
import {
  MIN_PW_LENGTH,
  PW_POLICY_HINT,
  checkRequirements,
  scorePassword,
  validateNewPassword,
  friendlyAuthError,
} from "@/lib/password";

const searchSchema = z.object({ next: z.string().optional() });

type PortalContext = {
  key: "admin" | "agency" | "talent" | "loved-one";
  name: string;      // "Admin", "Agency", "Talent", "Loved One"
  workspace: string; // "admin portal", "agency workspace", ...
  home: string;      // default landing route
};

function portalFromNext(next?: string): PortalContext {
  const path = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  if (path.startsWith("/agency"))
    return { key: "agency", name: "Agency", workspace: "agency workspace", home: "/agency" };
  if (path.startsWith("/talent"))
    return { key: "talent", name: "Talent", workspace: "talent workspace", home: "/talent" };
  if (path.startsWith("/loved-one"))
    return { key: "loved-one", name: "Loved One", workspace: "loved-one workspace", home: "/loved-one" };
  return { key: "admin", name: "Admin", workspace: "admin portal", home: "/admin" };
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: ({ match }) => {
    const p = portalFromNext((match.search as { next?: string }).next);
    return {
      meta: [
        { title: `Sign in · TalVault ${p.name}` },
        { name: "description", content: `Sign in to the TalVault ${p.workspace}.` },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // MFA challenge state (after successful password sign-in on an MFA-enrolled account)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const portal = useMemo(() => portalFromNext(search.next), [search.next]);

  useEffect(() => {
    let mounted = true;
    // Only auto-redirect to next when we already have an AAL2 session (or the
    // account has no verified MFA factor). Otherwise we'd bypass the challenge.
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!mounted || !sess.session) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") return;
      nav({ to: sanitizeNext(search.next) as any });
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, session) => {
      if (!session) return;
      if (evt === "MFA_CHALLENGE_VERIFIED" || evt === "SIGNED_IN" || evt === "TOKEN_REFRESHED") {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") return;
        nav({ to: sanitizeNext(search.next) as any });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [nav, search.next]);

  const isSignIn = mode === "sign-in";

  const strength = useMemo(() => scorePassword(password), [password]);
  const req = useMemo(() => checkRequirements(password), [password]);

  const validateSignUp = (): string | null => validateNewPassword(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!isSignIn) {
      const v = validateSignUp();
      if (v) {
        setError(v);
        return;
      }
    }

    setBusy(true);
    try {
      if (isSignIn) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Check if this account requires an MFA challenge.
        const { data: aal, error: aalErr } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalErr) throw aalErr;
        if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
          const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
          if (fErr) throw fErr;
          const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
          if (!totp) {
            // No verified factor but AAL2 required — safest is to sign out.
            await supabase.auth.signOut();
            throw new Error("Two-factor authentication is required but no factor is configured.");
          }
          setMfaFactorId(totp.id);
          setMfaCode("");
          setInfo("Enter the 6-digit code from your authenticator app to finish signing in.");
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${portal.home}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        setInfo(
          "Account created. If email confirmation is required, check your inbox before signing in.",
        );
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError(null);
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (vErr) throw vErr;
      // onAuthStateChange (MFA_CHALLENGE_VERIFIED) will redirect us.
      setInfo("Verified — redirecting…");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelMfa = async () => {
    // If the user bails out of the MFA challenge, drop the aal1 session so
    // nothing else in the app runs as a half-authenticated user.
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setMfaFactorId(null);
      setMfaCode("");
      setError(null);
      setInfo(null);
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) throw result.error;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="tv-auth">
      <aside className="tv-auth-hero">
        <div className="tv-auth-brand">
          <div className="tv-auth-mark">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="tv-auth-brand-title">TalVault</div>
            <div className="tv-auth-brand-sub">ADMIN PORTAL</div>
          </div>
        </div>

        <div>
          <h1 className="tv-auth-headline">
            The secure operations console for talent, agencies and loved ones.
          </h1>
          <p className="tv-auth-sub">
            Manage agencies, invitations, audit trails and platform integrity from one
            branded workspace — with role-based access and full audit history.
          </p>

          <ul className="tv-auth-points">
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <Lock className="h-4 w-4 text-white" />
              </span>
              Role-based access with row-level security
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <FileCheck2 className="h-4 w-4 text-white" />
              </span>
              Full audit log on every administrator action
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <Users className="h-4 w-4 text-white" />
              </span>
              Agency &amp; talent invitations, end to end
            </li>
          </ul>
        </div>

        <div className="tv-auth-footnote">TalVault Platform</div>
      </aside>

      <section className="tv-auth-panel">
        <div className="tv-auth-card">
          <div className="tv-auth-eyebrow">{isSignIn ? "Welcome back" : "Get started"}</div>
          <h2 className="tv-auth-title">
            {isSignIn ? "Sign in to TalVault Admin" : "Create your admin account"}
          </h2>
          <p className="tv-auth-tag">
            {isSignIn
              ? "Use your work email or continue with Google."
              : "Set up your credentials to access the admin console."}
          </p>

          {!mfaFactorId && (
            <>
              <div style={{ marginTop: 22 }}>
                <button
                  type="button"
                  className="tv-auth-google"
                  onClick={signInWithGoogle}
                  disabled={busy}
                >
                  <GoogleGlyph />
                  Continue with Google
                </button>
              </div>
              <div className="tv-auth-divider">or with email</div>
            </>
          )}

          {mfaFactorId ? (
            <form onSubmit={verifyMfa} noValidate>
              <div className="tv-auth-hint" style={{ marginTop: 8 }}>
                Two-factor authentication is enabled on this account. Enter the
                current 6-digit code from your authenticator app to finish
                signing in.
              </div>
              <div className="tv-auth-field">
                <label htmlFor="mfa-code">Authentication code</label>
                <input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  autoFocus
                />
              </div>
              {error && <div className="tv-auth-alert">{error}</div>}
              {info && <div className="tv-auth-alert tv-info">{info}</div>}
              <button
                type="submit"
                className="tv-auth-submit"
                disabled={busy || mfaCode.length !== 6}
              >
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              <div className="tv-auth-switch">
                <button
                  className="tv-auth-link"
                  type="button"
                  onClick={cancelMfa}
                  disabled={busy}
                >
                  Cancel and sign out
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={submit} noValidate>
            {!isSignIn && (
              <div className="tv-auth-field">
                <label htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Israel Noko"
                />
              </div>
            )}
            <div className="tv-auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="tv-auth-field">
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                value={password}
                onChange={setPassword}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                placeholder={isSignIn ? "Your password" : `At least ${MIN_PW_LENGTH} characters`}
                minLength={isSignIn ? 1 : MIN_PW_LENGTH}
              />
              {!isSignIn && (
                <>
                  <div className="tv-auth-hint">{PW_POLICY_HINT}</div>
                  {password.length > 0 && (
                    <>
                      <ul className="tv-auth-reqs" aria-live="polite">
                        <li className={req.length ? "ok" : ""}>
                          {req.length ? "✓" : "•"} At least {MIN_PW_LENGTH} characters
                        </li>
                        <li className={req.upper ? "ok" : ""}>
                          {req.upper ? "✓" : "•"} An uppercase letter
                        </li>
                        <li className={req.lower ? "ok" : ""}>
                          {req.lower ? "✓" : "•"} A lowercase letter
                        </li>
                        <li className={req.number ? "ok" : ""}>
                          {req.number ? "✓" : "•"} A number
                        </li>
                        <li className={req.special ? "ok" : ""}>
                          {req.special ? "✓" : "•"} A special character
                        </li>
                      </ul>
                      <div className="tv-auth-strength" aria-live="polite">
                        <div className="tv-auth-strength-bar">
                          <div
                            className="tv-auth-strength-fill"
                            style={{
                              width: `${strength.pct}%`,
                              background: strength.color,
                            }}
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
                </>
              )}
            </div>

            {error && <div className="tv-auth-alert">{error}</div>}
            {info && <div className="tv-auth-alert tv-info">{info}</div>}

            <button type="submit" className="tv-auth-submit" disabled={busy}>
              {busy ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}
            </button>
          </form>
          )}

          {!mfaFactorId && (
          <div className="tv-auth-switch">
            {isSignIn ? (
              <>
                No account yet?{" "}
                <button
                  className="tv-auth-link"
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    setMode("sign-up");
                  }}
                  type="button"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button
                  className="tv-auth-link"
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    setMode("sign-in");
                  }}
                  type="button"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
          )}

          <div className="tv-auth-back">
            <Link to="/" className="tv-auth-link">
              ← Back to site
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */


function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function sanitizeNext(next?: string): string {
  if (!next) return "/admin";
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}
