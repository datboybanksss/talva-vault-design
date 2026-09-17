import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PORTAL_FOR_DENIED_CODE, checkPortalAccess, resolvePortalHome } from "@/lib/portal-access";
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
import {
  INVITE_KINDS,
  claimInvitation,
  pendingInvitationForMe,
  type PendingInviteForMe,
} from "@/lib/invite-claim.functions";

import { logTalentSignIn } from "@/lib/talent-audit.functions";
import {
  beginSignInChallenge,
  getMfaStatus,
  requestSignInCode,
  verifySignInCode,
} from "@/lib/mfa.functions";
import { browserSessionId } from "@/lib/device";

/** Best-effort activity logging — never blocks or fails a sign-in. */
function recordSignIn() {
  void logTalentSignIn().catch(() => {});
}

const searchSchema = z.object({
  next: z.string().optional(),
  denied: z.string().optional(),
  invite: z.string().optional(),
  invite_kind: z.enum(INVITE_KINDS).optional(),
  reset: z.union([z.string(), z.number(), z.boolean()]).optional().transform((v) => (v === undefined ? undefined : String(v))),
});

/**
 * Wipes every trace of a stored session from this browser: the auth client's
 * own entry and the matching cookie. Belt and braces behind signOut(), so a
 * lingering session can never be resumed on the sign-in page.
 */
function clearStoredSession() {
  const isAuthKey = (k: string) => k.startsWith("sb-") && k.includes("auth-token");
  try {
    Object.keys(window.localStorage)
      .filter(isAuthKey)
      .forEach((k) => window.localStorage.removeItem(k));
    Object.keys(window.sessionStorage)
      .filter(isAuthKey)
      .forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* storage unavailable — the cookie clear below still runs */
  }
  document.cookie
    .split(";")
    .map((c) => c.split("=")[0]?.trim() ?? "")
    .filter(isAuthKey)
    .forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    });
}

function deniedMessage(
  code: string | undefined,
  portal: PortalContext,
  email: string | null,
): string | null {
  if (!code) return null;
  // The denial always describes the account that is still signed in, so name
  // it whenever we know it.
  const who = email ? `The account you were signed in as (${email})` : "That account";
  switch (code) {
    case "not_talent":
      return `${who} isn't set up as talent yet. Ask your manager to send you a talent invitation, or sign in with a different account.`;
    case "not_agency":
      return `${who} isn't an active member of any agency. Ask your agency owner to invite you, or sign in with a different account.`;
    case "not_admin":
      return `${who} doesn't have admin access. Sign in with one that does.`;
    default:
      return `${who} doesn't have access to the ${portal.workspace}.`;
  }
}

/** Portal-specific hero copy for the teal side-panel. */
const PORTAL_HERO: Record<
  PortalContext["key"],
  { headline: string; sub: string; points: string[] }
> = {
  platform: {
    headline: "One secure home for the documents that matter.",
    sub:
      "Sign in once and TalVault takes you to your own workspace — agency, talent or platform — with everything protected end to end.",
    points: [
      "Role-based access with row-level security",
      "Every document and share, protected end to end",
      "A one-time code by email on every sign-in",
    ],
  },
  admin: {
    headline: "The secure operations console for talent, agencies and loved ones.",
    sub: "Manage agencies, invitations, audit trails and platform integrity from one branded workspace — with role-based access and full audit history.",
    points: [
      "Role-based access with row-level security",
      "Full audit log on every administrator action",
      "Agency & talent invitations, end to end",
    ],
  },
  agency: {
    headline: "The branded workspace for your agency's talent and documents.",
    sub: "Manage your talent roster, shared folders and invitations from one secure workspace — with role-based access and full audit history.",
    points: [
      "Role-based access with row-level security",
      "Shared folders and documents, protected end to end",
      "Talent invitations, from send to sign-up",
    ],
  },
  talent: {
    headline: "Your personal vault for the documents that matter.",
    sub: "Access your talent vault, shared documents and agency invitations from one secure workspace — your records, protected end to end.",
    points: [
      "Role-based access with row-level security",
      "Every document and share, protected end to end",
      "Invitations from your agency, accepted in moments",
    ],
  },
  "loved-one": {
    headline: "Secure, private access to the documents shared with you.",
    sub: "View the records a trusted agency has shared with you from one secure workspace — your access, protected end to end.",
    points: [
      "Role-based access with row-level security",
      "Share links you control, protected end to end",
      "Read-only access, no setup required",
    ],
  },
};

type PortalContext = {
  key: "platform" | "admin" | "agency" | "talent" | "loved-one";
  name: string;      // "Admin", "Agency", "Talent", "Loved One"
  workspace: string; // "admin portal", "agency workspace", ...
  home: string;      // default landing route
};

function portalFromNext(next?: string): PortalContext {
  const path = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  // No destination in the URL: this is the single front-door sign-in page.
  // Where the account lands is resolved from its own records after sign-in.
  if (!path)
    return { key: "platform", name: "TalVault", workspace: "workspace", home: "/" };
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

  // Two-step sign-in state: after the password is accepted we ask for the
  // one-time code emailed to the account's own address.
  const [codeStage, setCodeStage] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [resending, setResending] = useState(false);

  const portal = useMemo(() => portalFromNext(search.next), [search.next]);
  const hero = PORTAL_HERO[portal.key];
  // The `denied` param is only a hint from the gate that bounced us here. It is
  // never trusted on its own: we re-check the *current* session before showing
  // the banner, so a stale param from an earlier denial (back button, refresh,
  // shared link, or signing in as a different account) can never linger.
  const [deniedState, setDeniedState] = useState<"checking" | "confirmed">("checking");
  const deniedConfirmedRef = useRef(false);
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null);
  const deniedPortal = search.denied ? PORTAL_FOR_DENIED_CODE[search.denied] : undefined;

  useEffect(() => {
    if (!search.denied) {
      deniedConfirmedRef.current = false;
      setDeniedState("checking");
      setDeniedEmail(null);
      return;
    }
    let mounted = true;
    const revalidate = async () => {
      // Unknown code, or no portal to check against — drop it rather than
      // showing a message we cannot substantiate.
      const result = deniedPortal ? await checkPortalAccess(deniedPortal) : "granted";
      if (!mounted) return;
      if (result === "denied") {
        // Name the account the denial applies to, so the message reads as being
        // about who was signed in rather than about the visitor.
        const { data: sess } = await supabase.auth.getSession();
        if (!mounted) return;
        setDeniedEmail((prev) => sess.session?.user.email ?? prev);
        deniedConfirmedRef.current = true;
        setDeniedState("confirmed");
        return;
      }
      if (result === "error") return; // transient: keep checking, show nothing
      // Signing the stale session out is what clears access here, and that must
      // not erase a refusal we have already shown — otherwise the explanation
      // vanishes the moment the session goes.
      if (deniedConfirmedRef.current) return;
      // Access is granted, or nobody was signed in to begin with: the denial no
      // longer applies, so drop it and show a plain sign-in form.
      nav({
        to: "/auth",
        search: { next: search.next, reset: search.reset } as never,
        replace: true,
      });
    };
    void revalidate();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void revalidate();
    });
    // A page restored from the back/forward cache keeps its old React state,
    // so an already-"confirmed" denial would linger without a fresh check.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setDeniedState("checking");
        void revalidate();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [search.denied, search.next, search.reset, deniedPortal, nav]);


  const denied = useMemo(
    () =>
      search.denied && deniedState === "confirmed"
        ? deniedMessage(search.denied, portal, deniedEmail)
        : null,
    [search.denied, deniedState, portal, deniedEmail],
  );

  // A confirmed denial is not always the end of the road: the account may have
  // been invited at this same address and simply never clicked the emailed
  // link. Surface that invitation so they can accept it here.
  const [pendingInvite, setPendingInvite] = useState<PendingInviteForMe | null>(null);
  const [claimingInvite, setClaimingInvite] = useState(false);
  // "checked" gates the denial notice: until we know whether an invitation is
  // waiting, showing "ask your manager to invite you" could contradict it.
  const [inviteChecked, setInviteChecked] = useState(false);

  useEffect(() => {
    if (!denied) {
      setPendingInvite(null);
      setInviteChecked(false);
      return;
    }
    let mounted = true;
    setInviteChecked(false);
    void pendingInvitationForMe({ data: {} })
      .then((res) => {
        if (mounted) setPendingInvite(res);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setInviteChecked(true);
      });
    return () => {
      mounted = false;
    };
  }, [denied]);

  const acceptPendingInvite = useCallback(async () => {
    if (!pendingInvite) return;
    setClaimingInvite(true);
    setError(null);
    try {
      const res = await claimInvitation({
        data: { token: pendingInvite.token, kind: pendingInvite.kind },
      });
      if (res.ok) {
        nav({ to: res.dest as any, replace: true });
        return;
      }
      setError(res.message);
    } catch (e: any) {
      setError(e?.message ?? "We couldn't accept that invitation. Please try the emailed link.");
    } finally {
      setClaimingInvite(false);
    }
  }, [pendingInvite, nav]);


  // Where to send a signed-in user. An explicit `next` wins; otherwise the
  // destination is resolved from the account's real access rather than assumed
  // to be /admin (that assumption is what manufactured phantom denials).
  const goNext = useCallback(
    async (replace = false) => {
      // Arrived here from an invitation link with an existing account: attach
      // the invitation to this account silently, then land on its workspace.
      if (search.invite && search.invite_kind) {
        const res = await claimInvitation({
          data: { token: search.invite, kind: search.invite_kind },
        });
        if (res.ok) {
          nav({ to: res.dest as any, replace: true });
          return;
        }
        setError(res.message);
        return;
      }
      const explicit =
        search.next && search.next.startsWith("/") && !search.next.startsWith("//")
          ? search.next
          : null;
      const dest = explicit ?? (await resolvePortalHome());
      if (!dest) {
        setInfo(
          "You're signed in, but this account isn't linked to a workspace yet. Ask your agency owner or manager to send you an invitation.",
        );
        return;
      }
      nav({ to: dest as any, replace });
    },
    [search.next, search.invite, search.invite_kind, nav],
  );


  // Sends (or resends) the one-time code and shows the code step.
  const startCodeChallenge = useCallback(async (silent = false) => {
    setCodeStage(true);
    const res = await requestSignInCode();
    if (res.ok) {
      setError(null);
      setInfo(res.message);
    } else if (!silent) {
      setInfo(null);
      setError(res.message);
    }
  }, []);

  // What happens once the password has been accepted: the account's own
  // records decide whether it needs first-time set-up, a code, or nothing.
  const afterPassword = useCallback(async () => {
    // Every password sign-in earns a fresh code, even on a browser that was
    // verified earlier today.
    await beginSignInChallenge({ data: { device: browserSessionId() } }).catch(() => {});
    const status = await getMfaStatus({ data: { device: browserSessionId() } });
    if (status.gate === "enrol") {
      nav({ to: "/enroll-2fa", search: { next: search.next } as never, replace: true });
      return;
    }
    if (status.gate === "challenge") {
      await startCodeChallenge();
      return;
    }
    recordSignIn();
    await goNext(true);
  }, [nav, search.next, startCodeChallenge, goNext]);

  // Landing on the sign-in page always means starting from scratch. Any session
  // still lying around from an earlier visit is cleared here, so email and
  // password are entered every time and the code step can only ever be reached
  // by getting the password right first — no resuming, no shortcuts.
  const clearedStaleSessionRef = useRef(false);
  useEffect(() => {
    if (clearedStaleSessionRef.current) return;
    clearedStaleSessionRef.current = true;
    console.log("[tv-dbg] clear effect start");
    let showing = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      // Remember who it was: a denial notice needs to name the account even
      // after the session behind it is gone.
      if (showing) setDeniedEmail((prev) => prev ?? sess.session?.user.email ?? null);
      // The clearing itself is deliberately not gated on the component still
      // being mounted — React's double-invoked effects would otherwise skip it
      // and leave the session in place.
      void supabase.auth.signOut({ scope: "local" }).catch(() => {});
      clearStoredSession();
      console.log("[tv-dbg] cleared", Object.keys(window.localStorage).filter((k) => k.startsWith("sb-")));
    })();
    return () => {
      showing = false;
    };
  }, []);


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
        // Two-step sign-in is mandatory: never land anyone in a portal on a
        // password alone.
        await afterPassword();
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
    setError(null);
    setBusy(true);
    try {
      const res = await verifySignInCode({
        data: { code: mfaCode.trim(), device: browserSessionId() },
      });
      if (!res.ok) {
        setInfo(null);
        setError(res.message);
        return;
      }
      recordSignIn();
      setInfo("Verified — signing you in…");
      setCodeStage(false);
      setMfaCode("");
      await goNext(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setResending(true);
    try {
      await startCodeChallenge();
    } finally {
      setResending(false);
    }
  };

  const cancelMfa = async () => {
    // If the user bails out of the code step, drop the half-authenticated
    // session so nothing else in the app runs as a partly signed-in user.
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setCodeStage(false);
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
            <TalVaultIcon variant="white" style={{ height: 24, width: 24 }} />
          </div>
          <div>
            <TalVaultWordmark variant="white" style={{ height: 20 }} />
            <div className="tv-auth-brand-sub">{portal.name.toUpperCase()} PORTAL</div>
          </div>
        </div>

        <div>
          <h1 className="tv-auth-headline">{hero.headline}</h1>
          <p className="tv-auth-sub">{hero.sub}</p>

          <ul className="tv-auth-points">
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <Lock className="h-4 w-4 text-white" />
              </span>
              {hero.points[0]}
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <FileCheck2 className="h-4 w-4 text-white" />
              </span>
              {hero.points[1]}
            </li>
            <li className="tv-auth-point">
              <span className="tv-auth-point-dot">
                <Users className="h-4 w-4 text-white" />
              </span>
              {hero.points[2]}
            </li>
          </ul>
        </div>

        <div className="tv-auth-footnote">TalVault Platform</div>
      </aside>

      <section className="tv-auth-panel">
        <div className="tv-auth-card">
          <div className="tv-auth-eyebrow">{isSignIn ? "Welcome back" : "Get started"}</div>
          <h2 className="tv-auth-title">
            {isSignIn
              ? portal.key === "platform"
                ? "Sign in to TalVault"
                : `Sign in to TalVault ${portal.name}`
              : `Create your ${portal.key === "admin" ? "admin" : portal.name.toLowerCase()} account`}
          </h2>
          <p className="tv-auth-tag">
            {isSignIn
              ? "Use your work email or continue with Google. We'll take you to your own workspace."
              : `Set up your credentials to access the ${portal.workspace}.`}
          </p>

          {search.reset === "1" && !codeStage && (
            <div className="tv-auth-alert tv-info" style={{ marginTop: 18 }}>
              Your password has been updated. Sign in with your new password.
            </div>
          )}

          {denied && !codeStage && pendingInvite && (
            <div className="tv-auth-alert tv-info" style={{ marginTop: 18 }}>
              You have a pending{" "}
              {pendingInvite.kind === "agency"
                ? "agency"
                : pendingInvite.kind === "talent"
                  ? "talent"
                  : "administrator"}{" "}
              invitation
              {pendingInvite.label ? ` from ${pendingInvite.label}` : ""} waiting for
              this account. Accept it to finish setting up your access.
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="tv-auth-link"
                  disabled={claimingInvite}
                  onClick={acceptPendingInvite}
                >
                  {claimingInvite ? "Accepting…" : "Accept invitation"}
                </button>
              </div>
            </div>
          )}

          {/* Only when there is genuinely nothing waiting for this account —
              a pending invitation and "no access" can never both be true. */}
          {denied && !codeStage && inviteChecked && !pendingInvite && (
            <div className="tv-auth-alert" style={{ marginTop: 18 }}>
              {denied}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="tv-auth-link"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await supabase.auth.signOut();
                    } finally {
                      setBusy(false);
                      nav({ to: "/auth", search: { next: search.next } as never, replace: true });
                    }
                  }}
                >
                  Sign out and use another account
                </button>
              </div>
            </div>
          )}



          {!codeStage && (
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

          {codeStage ? (
            <form onSubmit={verifyMfa} noValidate>
              <div className="tv-auth-hint" style={{ marginTop: 8 }}>
                For your security we've emailed you a 6-digit code. Enter it
                below to finish signing in. It expires in 10 minutes and can
                only be used once.
              </div>
              <div className="tv-auth-field">
                <label htmlFor="mfa-code">Sign-in code</label>
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
              <div className="tv-auth-switch" style={{ display: "flex", gap: 14 }}>
                <button
                  className="tv-auth-link"
                  type="button"
                  onClick={resendCode}
                  disabled={busy || resending}
                >
                  {resending ? "Sending…" : "Send a new code"}
                </button>
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
                placeholder="name@email.com"
              />
            </div>
            <div className="tv-auth-field">
              <div className="tv-auth-label-row">
                <label htmlFor="password">Password</label>
                {isSignIn && (
                  <Link
                    to="/forgot-password"
                    search={{ next: sanitizeNext(search.next) }}
                    className="tv-auth-link"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
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

          {!codeStage && (
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
