import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Smartphone, ShieldCheck, KeyRound, Copy, Check } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { logMfaEnrolled } from "@/lib/admin.functions";
import { friendlyAuthError } from "@/lib/password";
import { resolvePortalHome } from "@/lib/portal-access";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/enroll-2fa")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Set up two-factor authentication · TalVault" },
      {
        name: "description",
        content:
          "Two-factor authentication is required on every TalVault account. Scan the code with your authenticator app to finish setting it up.",
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
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const goHome = async () => {
    const dest = safeNext(search.next) ?? (await resolvePortalHome());
    navigate({ to: (dest ?? "/auth") as never, replace: true });
  };

  const startedRef = useRef(false);

  const beginEnroll = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const allFactors = ((factors as any)?.all ?? []) as any[];
    const verified = allFactors.find(
      (f: any) => f.factor_type === "totp" && f.status === "verified",
    );
    if (verified) {
      await goHome();
      return;
    }

    // Clear abandoned unverified factors, otherwise enrol() fails with
    // "a factor with this friendly name already exists".
    for (const f of allFactors) {
      if (f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "TalVault",
      friendlyName: `TalVault (${user?.email ?? user?.id ?? "account"})`,
    });
    if (error) throw error;
    setPendingFactorId(data.id);
    setQrSvg((data.totp as any)?.qr_code ?? null);
    setSecret((data.totp as any)?.secret ?? null);
    setCode("");
  };

  useEffect(() => {
    // Guard against React StrictMode double-invoke: two parallel runs would
    // unenrol each other's fresh factor, leaving a stale id that fails
    // challenge with "Factor not found".
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
        await beginEnroll();
      } catch (e) {
        setError(friendlyAuthError(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFactorId) return;
    setError(null);
    setBusy(true);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      });
      if (cErr) {
        // The pending factor vanished (stale tab, duplicate enrol). Rebuild a
        // fresh QR code instead of showing a confusing "Factor not found".
        if ((cErr as any)?.code === "mfa_factor_not_found" || (cErr as any)?.status === 404) {
          await beginEnroll();
          setError("That setup code expired. Scan the new QR code and try again.");
          return;
        }
        throw cErr;
      }

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      // Audit entry is admin-scoped; harmless (and expected) to fail for others.
      try {
        await logMfaEnrolled({ data: { factor_type: "totp" } });
      } catch {
        /* not an administrator — no admin audit entry */
      }
      toast.success("Two-factor authentication enabled.");
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

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the key. Select and copy it manually.");
    }
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
          <h1 className="tv-auth-headline">
            One more step before your workspace opens.
          </h1>
          <p className="tv-auth-sub">
            TalVault holds sensitive personal and financial records, so every
            account is protected by two-factor authentication. It takes about a
            minute to set up and you'll only need your phone at sign-in.
          </p>

          <ul className="tv-auth-points">
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <Smartphone className="h-4 w-4 text-white" />
              </span>
              Install an authenticator app on your phone
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <ShieldCheck className="h-4 w-4 text-white" />
              </span>
              Scan the code shown here to pair it
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <KeyRound className="h-4 w-4 text-white" />
              </span>
              Enter the 6-digit code to confirm
            </li>
          </ul>
        </div>

        <div className="tv-auth-footnote">TalVault Platform</div>
      </aside>

      <section className="tv-auth-panel">
        <div className="tv-auth-card">
          <div className="tv-auth-eyebrow">Security setup</div>
          <h2 className="tv-auth-title">Set up two-factor authentication</h2>
          <p className="tv-auth-tag">
            {email
              ? `Signed in as ${email}. You can't open your workspace until this is enabled.`
              : "You can't open your workspace until this is enabled."}
          </p>

          {loading ? (
            <div className="tv-auth-hint" style={{ marginTop: 22 }}>
              Preparing your setup code…
            </div>
          ) : (
            <form onSubmit={verify} style={{ marginTop: 20 }} noValidate>
              <div className="tv-auth-hint">
                Open your authenticator app (Google Authenticator, Authy,
                1Password or similar), choose “add account”, then scan this code.
              </div>

              {qrSvg && (
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "center",
                    background: "var(--surface-soft)",
                    border: "1px solid var(--line)",
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <img
                    src={qrSvg}
                    alt="Two-factor authentication QR code"
                    width={188}
                    height={188}
                    style={{
                      display: "block",
                      background: "#fff",
                      borderRadius: 10,
                      padding: 8,
                    }}
                  />
                </div>
              )}

              {secret && (
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <div className="tv-auth-hint" style={{ marginTop: 0 }}>
                      Can't scan? Enter this key manually
                    </div>
                    <code
                      style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: 12.5,
                        letterSpacing: ".08em",
                        wordBreak: "break-all",
                        color: "var(--ink)",
                        fontWeight: 700,
                      }}
                    >
                      {secret}
                    </code>
                  </div>
                  <button
                    type="button"
                    className="tvp-secondary"
                    onClick={copySecret}
                    aria-label="Copy setup key"
                    style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}

              <div className="tv-auth-field">
                <label htmlFor="mfa-enroll-code">Authentication code</label>
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
                  The code changes every 30 seconds — enter the one showing now.
                </div>
              </div>

              {error && <div className="tv-auth-alert">{error}</div>}

              <button
                type="submit"
                className="tv-auth-submit"
                disabled={busy || code.length !== 6 || !pendingFactorId}
              >
                {busy ? "Verifying…" : "Verify & enable 2FA"}
              </button>

              <div className="tv-auth-switch">
                Not your account?{" "}
                <button
                  type="button"
                  className="tv-auth-link"
                  onClick={signOut}
                  disabled={busy}
                >
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
