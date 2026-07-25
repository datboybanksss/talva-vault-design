import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/password";

const searchSchema = z.object({ next: z.string().optional() });

function sanitizeNext(next?: string): string {
  if (!next) return "/admin";
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}

function portalName(next: string): string {
  if (next.startsWith("/agency")) return "Agency";
  if (next.startsWith("/talent")) return "Talent";
  if (next.startsWith("/loved-one")) return "Loved One";
  return "Admin";
}

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Reset your password · TalVault" },
      {
        name: "description",
        content: "Request a secure password reset link for your TalVault account.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Reset your password · TalVault" },
      {
        property: "og:description",
        content: "Request a secure password reset link for your TalVault account.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const search = useSearch({ from: "/forgot-password" });
  const next = useMemo(() => sanitizeNext(search.next), [search.next]);
  const portal = portalName(next);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password?next=${encodeURIComponent(next)}`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tv-auth-simple">
      <div className="tv-auth-card">
        <div className="tv-auth-brand" style={{ marginBottom: 18 }}>
          <div className="tv-auth-mark">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="tv-auth-brand-title">TalVault</div>
            <div className="tv-auth-brand-sub">{portal.toUpperCase()} PORTAL</div>
          </div>
        </div>

        <div className="tv-auth-eyebrow">Account recovery</div>
        <h1 className="tv-auth-title">Forgot your password?</h1>
        <p className="tv-auth-tag">
          Enter the email address on your account and we&apos;ll send you a secure link
          to set a new password.
        </p>

        {sent ? (
          <>
            <div className="tv-auth-alert tv-info" style={{ marginTop: 18 }}>
              If an account exists for <strong>{email.trim()}</strong>, a reset link is
              on its way. The link expires shortly — check your spam folder if it
              doesn&apos;t arrive.
            </div>
            <div className="tv-auth-switch">
              <button
                type="button"
                className="tv-auth-link"
                onClick={() => setSent(false)}
              >
                Use a different email
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="tv-auth-field">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            {error && <div className="tv-auth-alert">{error}</div>}
            <button
              type="submit"
              className="tv-auth-submit"
              disabled={busy || !email.trim()}
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="tv-auth-back">
          <Link to="/auth" search={{ next }} className="tv-auth-link">
            ← Back to {portal} sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
