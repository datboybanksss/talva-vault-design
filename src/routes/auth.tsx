import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ShieldCheck } from "lucide-react";
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
        setError(
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
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) throw result.error;
      // If redirected, browser navigates away. If not, session set → onAuthStateChange fires.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="tvp-card tvp-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div className="tvp-brand-mark" style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="tvp-h2">TalVault Admin</div>
              <div className="tvp-muted" style={{ fontSize: 12 }}>
                {mode === "sign-in" ? "Sign in to your admin account" : "Create your admin account"}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="tvp-secondary"
            onClick={signInWithGoogle}
            disabled={busy}
            style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}
          >
            Continue with Google
          </button>

          <div className="tvp-muted" style={{ textAlign: "center", fontSize: 12, margin: "6px 0 10px" }}>
            or with email
          </div>

          <form onSubmit={submit}>
            {mode === "sign-up" && (
              <div className="tvp-form-group">
                <label>Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Israel Noko"
                />
              </div>
            )}
            <div className="tvp-form-group">
              <label>Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="tvp-form-group">
              <label>Password</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {error && (
              <div
                className="tvp-status tvp-red"
                style={{ display: "block", padding: 10, marginBottom: 10, fontSize: 12 }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="tvp-primary"
              disabled={busy}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div style={{ marginTop: 14, textAlign: "center", fontSize: 13 }}>
            {mode === "sign-in" ? (
              <>
                No account yet?{" "}
                <button
                  className="tvp-link"
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
                  className="tvp-link"
                  onClick={() => setMode("sign-in")}
                  type="button"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="tvp-muted" style={{ fontSize: 11, marginTop: 16, textAlign: "center" }}>
            <Link to="/" className="tvp-link">← Back to site</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function sanitizeNext(next?: string): string {
  if (!next) return "/admin";
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}
