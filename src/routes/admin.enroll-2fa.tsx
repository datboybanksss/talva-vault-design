import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logMfaEnrolled, whoami } from "@/lib/admin.functions";
import { friendlyAuthError } from "@/lib/password";

export const Route = createFileRoute("/admin/enroll-2fa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up 2FA · TalVault Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EnrollTwoFactorPage,
});

function EnrollTwoFactorPage() {
  const navigate = useNavigate();
  const logEnrolledFn = useServerFn(logMfaEnrolled);
  const whoamiFn = useServerFn(whoami);

  const [email, setEmail] = useState<string>("");
  const [required, setRequired] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // If a verified factor already exists, bounce to /admin.
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const allFactors = (factors as any)?.all ?? [];
        const verified = allFactors.find(
          (f: any) => f.factor_type === "totp" && f.status === "verified",
        );
        if (verified) {
          navigate({ to: "/admin" });
          return;
        }
        // Determine whether this account is actually required to enroll.
        const me = await whoamiFn();
        const isReq =
          !!me?.isMainAdmin || me?.permissionLevel === "edit";
        setRequired(isReq);
        setEmail(me?.email ?? "");

        // Clear any abandoned unverified factors — use `all` because the
        // `totp` convenience list from listFactors() is filtered to verified
        // factors only, so unverified ones would otherwise linger and cause
        // "factor with this friendly name already exists" on enroll.
        for (const f of allFactors) {
          if (f.status !== "verified") {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
          }
        }
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `TalVault (${me?.email ?? "admin"})`,
        });
        if (error) throw error;
        setPendingFactorId(data.id);
        setQrSvg((data.totp as any)?.qr_code ?? null);
        setSecret((data.totp as any)?.secret ?? null);
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
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      await logEnrolledFn({ data: { factor_type: "totp" } });
      toast.success("Two-factor authentication enabled.");
      navigate({ to: "/admin" });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
      <div className="tvp-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            className="tvp-kpi-icon tvp-bg-purple"
            style={{ width: 40, height: 40 }}
          >
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="tvp-h1" style={{ margin: 0, fontSize: 22 }}>
              Set up two-factor authentication
            </h1>
            <div className="tvp-muted" style={{ fontSize: 13 }}>
              {required
                ? "Required for your administrator role — you cannot access the admin console until 2FA is enabled."
                : "Recommended for your account."}
              {email ? ` Signed in as ${email}.` : ""}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="tvp-muted" style={{ marginTop: 16 }}>Loading…</div>
        ) : (
          <form onSubmit={verify} style={{ marginTop: 16 }} noValidate>
            <div className="tvp-muted" style={{ fontSize: 13 }}>
              Scan the QR code below with an authenticator app (Google
              Authenticator, Authy, 1Password, etc.), then enter the 6-digit
              code it displays to verify.
            </div>
            {qrSvg && (
              <div
                style={{
                  marginTop: 12,
                  background: "white",
                  padding: 12,
                  borderRadius: 12,
                  width: "fit-content",
                }}
              >
                <img
                  src={qrSvg}
                  alt="Two-factor authentication QR code"
                  width={200}
                  height={200}
                  style={{ display: "block" }}
                />
              </div>
            )}
            {secret && (
              <div className="tv-auth-hint" style={{ marginTop: 8 }}>
                Can't scan? Enter this key manually:{" "}
                <code
                  style={{
                    background: "var(--tvp-surface-soft)",
                    padding: "2px 6px",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  {secret}
                </code>
              </div>
            )}
            <div className="tv-auth-field" style={{ marginTop: 12 }}>
              <label htmlFor="mfa-enroll-code">Enter code from app</label>
              <input
                id="mfa-enroll-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
              />
            </div>
            {error && (
              <div
                className="tvp-callout"
                role="alert"
                style={{
                  marginTop: 12,
                  background: "var(--tvp-amber-bg)",
                  borderColor: "color-mix(in oklab, var(--tvp-amber) 40%, transparent)",
                }}
              >
                <div
                  className="tvp-callout-icon"
                  style={{ background: "color-mix(in oklab, var(--tvp-amber) 22%, white)", color: "var(--tvp-amber)" }}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div style={{ fontSize: 13, color: "var(--tvp-ink)", fontWeight: 600 }}>{error}</div>
              </div>
            )}
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                type="submit"
                className="tvp-primary"
                disabled={busy || code.length !== 6 || !pendingFactorId}
              >
                {busy ? "Verifying…" : "Verify & enable 2FA"}
              </button>
              <button
                type="button"
                className="tvp-secondary"
                onClick={signOut}
                disabled={busy}
              >
                Sign out
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
