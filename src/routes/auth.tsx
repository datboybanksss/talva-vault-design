import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ShieldCheck, Lock, FileCheck2, Users } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in · TalVault Admin" },
      { name: "description", content: "Sign in to the TalVault Admin portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) nav({ to: sanitizeNext(search.next) as any });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) nav({ to: sanitizeNext(search.next) as any });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [nav, search.next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        setInfo(
          "Account created. If email confirmation is required, check your inbox before signing in.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
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

  const isSignIn = mode === "sign-in";

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

        <div className="tv-auth-footnote">TalVault · Minerva Platform</div>
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
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {error && <div className="tv-auth-alert">{error}</div>}
            {info && <div className="tv-auth-alert tv-info">{info}</div>}

            <button type="submit" className="tv-auth-submit" disabled={busy}>
              {busy ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="tv-auth-switch">
            {isSignIn ? (
              <>
                No account yet?{" "}
                <button
                  className="tv-auth-link"
                  onClick={() => setMode("sign-up")}
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
                  onClick={() => setMode("sign-in")}
                  type="button"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

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
