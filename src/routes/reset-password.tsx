import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
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

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Set a new password · TalVault" },
      {
        name: "description",
        content: "Choose a new password for your TalVault account.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Set a new password · TalVault" },
      {
        property: "og:description",
        content: "Choose a new password for your TalVault account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/reset-password" });
  const next = useMemo(() => sanitizeNext(search.next), [search.next]);
  const portal = portalName(next);

  const [ready, setReady] = useState(false);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);
  const req = useMemo(() => checkRequirements(password), [password]);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted || !session) return;
      setLinkValid(true);
      setReady(true);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) setLinkValid(true);
      setReady(true);
    })();
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validateNewPassword(password);
    if (v) return setError(v);
    if (password !== confirm)
      return setError("New password and confirmation do not match.");

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      await supabase.auth.signOut();
      nav({ to: "/auth", search: { next, reset: "1" } as never, replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  };

  return (
    <div className="tv-auth tv-auth-simple">
      <div className="tv-auth-card">
        <div className="tv-auth-brand" style={{ marginBottom: 18 }}>
          <div className="tv-auth-mark">
            <TalVaultIcon variant="white" style={{ height: 24, width: 24 }} />
          </div>
          <div>
            <TalVaultWordmark variant="white" style={{ height: 20 }} />
            <div className="tv-auth-brand-sub">{portal.toUpperCase()} PORTAL</div>
          </div>
        </div>

        <div className="tv-auth-eyebrow">Account recovery</div>
        <h1 className="tv-auth-title">Set a new password</h1>
        <p className="tv-auth-tag">
          Choose a strong password you don&apos;t use anywhere else. You&apos;ll be
          returned to the {portal} sign-in page afterwards.
        </p>

        {!ready ? (
          <div className="tv-auth-hint" style={{ marginTop: 18 }}>
            Verifying your reset link…
          </div>
        ) : !linkValid ? (
          <>
            <div className="tv-auth-alert" style={{ marginTop: 18 }}>
              This reset link is invalid or has expired. Request a new one to continue.
            </div>
            <div className="tv-auth-switch">
              <Link
                to="/forgot-password"
                search={{ next }}
                className="tv-auth-link"
              >
                Request a new reset link
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="tv-auth-field">
              <label htmlFor="new-password">New password</label>
              <PasswordInput
                id="new-password"
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
              <label htmlFor="confirm-password">Confirm new password</label>
              <PasswordInput
                id="confirm-password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                minLength={MIN_PW_LENGTH}
              />
            </div>

            {error && <div className="tv-auth-alert">{error}</div>}

            <button type="submit" className="tv-auth-submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
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
