import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMfaStatus } from "@/lib/mfa.functions";
import { browserSessionId } from "@/lib/device";
import { SectionHeader } from "./section-header";

/**
 * Two-step sign-in card shown on profile/account settings pages.
 *
 * The second factor is an emailed one-time code, set up at first sign-in via
 * /enroll-2fa. There's no authenticator app, QR code or secret to scan, and the
 * step is required on every TalVault account — so this card simply reports the
 * current state and explains the flow in plain language.
 */
export function TwoFactorCard({
  contextLabel = "account",
}: {
  contextLabel?: string;
}) {
  const getStatus = useServerFn(getMfaStatus);

  const status = useQuery({
    queryKey: ["mfa", "status", browserSessionId()],
    queryFn: () => getStatus({ data: { device: browserSessionId() } }),
  });

  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof status.data?.email === "string") setEmail(status.data.email);
  }, [status.data?.email]);

  const enrolled = !!status.data?.enrolled;

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<MailCheck className="h-4 w-4" />}
        tone="purple"
        title="Two-step sign-in"
        subtitle="A short code is emailed to you each time you sign in."
      />

      <div style={{ marginTop: 10 }}>
        {status.isLoading ? (
          <div className="tvp-muted">Checking your account…</div>
        ) : enrolled ? (
          <div className="tv-form-alert tv-form-alert-info">
            Two-step sign-in is <strong>enabled</strong> on this{" "}
            {contextLabel} account. After your password is accepted we email a
            6-digit code
            {email ? (
              <>
                {" "}
                to <strong>{email}</strong>
              </>
            ) : null}
            . Type it in to finish signing in. The code expires in 10 minutes
            and works once — there's nothing to install and nothing to remember.
            <div style={{ marginTop: 6 }}>
              Two-step sign-in is required for every TalVault account and can't
              be turned off.
            </div>
          </div>
        ) : (
          <div className="tv-form-alert tv-form-alert-info">
            Two-step sign-in isn't set up on this account yet. The next time you
            sign in you'll be emailed a 6-digit code to enter after your
            password — there's nothing to install.
          </div>
        )}
      </div>

      {!status.isLoading && !enrolled && (
        <div style={{ marginTop: 10 }}>
          <Link to="/enroll-2fa" className="tvp-primary">
            Set it up now
          </Link>
        </div>
      )}
    </div>
  );
}
