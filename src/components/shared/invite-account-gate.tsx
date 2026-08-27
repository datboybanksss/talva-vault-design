import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  claimInvitation,
  inviteAccountStatus,
  INVITE_PORTAL_HOME,
  type InviteKind,
} from "@/lib/invite-claim.functions";

/**
 * Invitation links opened by someone who already has a TalVault account.
 *
 * Three situations are handled here, so every activation wizard behaves the
 * same way:
 *  1. Signed in as the invited person → claim the invitation silently and go
 *     straight to the relevant workspace.
 *  2. Signed in as somebody else → say so plainly; never link the invitation
 *     to the wrong account.
 *  3. Signed out, but the invited address already has an account → offer
 *     "Log in instead", carrying the token through the sign-in flow.
 *
 * While `state` is "checking" the wizard should not render; when it is
 * "new-account" the wizard takes over as normal.
 */

export type InviteGateState =
  | "checking"
  | "new-account"
  | "existing-account"
  | "wrong-account"
  | "claiming";

export function useInviteAccountGate({
  token,
  kind,
  invitedEmail,
}: {
  token: string;
  kind: InviteKind;
  invitedEmail: string | null;
}) {
  const nav = useNavigate();
  const [state, setState] = useState<InviteGateState>("checking");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const session = sess.session;

      if (session) {
        const email = session.user.email ?? "";
        if (!alive) return;
        setSignedInEmail(email);
        const matches =
          invitedEmail != null &&
          email.trim().toLowerCase() === invitedEmail.trim().toLowerCase();
        if (!matches) {
          setState("wrong-account");
          return;
        }
        setState("claiming");
        const res = await claimInvitation({ data: { token, kind } });
        if (!alive) return;
        if (res.ok) {
          nav({ to: res.dest as string, replace: true });
          return;
        }
        setError(res.message);
        setState("wrong-account");
        return;
      }

      if (!invitedEmail) {
        if (alive) setState("new-account");
        return;
      }

      const status = await inviteAccountStatus({ data: { token, kind } });
      if (!alive) return;
      setState(status.account_exists ? "existing-account" : "new-account");
    })().catch(() => {
      if (alive) setState("new-account");
    });
    return () => {
      alive = false;
    };
  }, [token, kind, invitedEmail, nav]);

  return { state, signedInEmail, error, setState };
}

export function InviteAccountGatePanel({
  eyebrow,
  token,
  kind,
  invitedEmail,
  state,
  signedInEmail,
  error,
  onUseDifferentAccount,
}: {
  eyebrow: string;
  token: string;
  kind: InviteKind;
  invitedEmail: string | null;
  state: InviteGateState;
  signedInEmail: string | null;
  error: string | null;
  onUseDifferentAccount: () => void;
}) {
  const loginSearch = {
    invite: token,
    invite_kind: kind,
    next: INVITE_PORTAL_HOME[kind],
  } as const;

  if (state === "checking" || state === "claiming") {
    return (
      <>
        <div className="tv-auth-eyebrow">{eyebrow}</div>
        <h2 className="tv-auth-title">
          {state === "claiming" ? "Linking your invitation…" : "Checking your invitation…"}
        </h2>
        <p className="tv-auth-tag">One moment please.</p>
      </>
    );
  }

  if (state === "wrong-account") {
    return (
      <>
        <div className="tv-auth-eyebrow">{eyebrow}</div>
        <h2 className="tv-auth-title">
          {error ? "We couldn't link this invitation" : "This invitation is for a different account"}
        </h2>
        <p className="tv-auth-tag">
          {error ??
            `You're signed in as ${signedInEmail ?? "another account"}, but this invitation was sent to ${invitedEmail ?? "a different address"}. Sign out and sign in with the invited address to continue.`}
        </p>
        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          <button type="button" className="tv-auth-submit" onClick={onUseDifferentAccount}>
            Sign out and continue
          </button>
          <Link to="/auth" className="tv-auth-link">
            Go to sign in →
          </Link>
        </div>
      </>
    );
  }

  // existing-account
  return (
    <>
      <div className="tv-auth-eyebrow">{eyebrow}</div>
      <h2 className="tv-auth-title">You already have a TalVault account</h2>
      <p className="tv-auth-tag">
        {invitedEmail
          ? `An account already exists for ${invitedEmail}. Log in and we'll add this invitation to it automatically — there's nothing else to set up.`
          : "An account already exists for this address. Log in and we'll add this invitation to it automatically."}
      </p>
      <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <Link to="/auth" search={loginSearch} className="tv-auth-submit" style={{ textAlign: "center" }}>
          Log in instead
        </Link>
      </div>
    </>
  );
}
