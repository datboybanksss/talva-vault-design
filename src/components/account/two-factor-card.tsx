import { maskEmail, SIGN_IN_CODE_EXPIRY, SIGN_IN_CODE_MISSING } from "@/lib/mfa-copy";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMfaStatus } from "@/lib/mfa.functions";
import { SectionHeader } from "./section-header";

/**
 * Two-step sign-in card shown on profile/account settings pages.
 *
 * The second factor is an emailed one-time code, first sent at sign-in via
 * /enroll-2fa. There's no authenticator app, QR code or secret to scan, and the
 * step is required on every TalVault account — so this card simply reports the
 * current state and explains the flow in plain language.
 */
export function TwoFactorCard({ contextLabel = "account" }: { contextLabel?: string }) {
  const getStatus = useServerFn(getMfaStatus);

  const status = useQuery({
    queryKey: ["mfa", "status"],
    queryFn: () => getStatus({ data: {} }),
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
            For your security, each time you sign in to this {contextLabel} account we email a
            one-time code to <strong>{maskEmail(email)}</strong>. Enter it to continue.{" "}
            {SIGN_IN_CODE_EXPIRY} {SIGN_IN_CODE_MISSING}
            <div style={{ marginTop: 6 }}>
              This is required for every TalVault account and can't be turned off.
            </div>
          </div>
        ) : (
          <div className="tv-form-alert tv-form-alert-info">
            The next time you sign in, we'll email a one-time code to{" "}
            <strong>{maskEmail(email)}</strong>. Enter it to continue. {SIGN_IN_CODE_EXPIRY}
          </div>
        )}
      </div>

      {!status.isLoading && !enrolled && (
        <div style={{ marginTop: 10 }}>
          <Link to="/enroll-2fa" className="tvp-primary">
            Get my sign-in code
          </Link>
        </div>
      )}
    </div>
  );
}
