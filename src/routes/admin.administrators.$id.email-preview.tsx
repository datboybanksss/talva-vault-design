import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ArrowLeft, Send, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getAdminInvitationById, resendAdminInvitation } from "@/lib/admin.functions";
import { effectiveInvitationStatus } from "@/lib/invitation-status";
import { sendAdminInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_ADMIN_INVITATION_SUBJECT,
  DEFAULT_ADMIN_INVITATION_BODY,
  EMAIL_FALLBACK_NOTICE,
} from "@/lib/invitation-email";
import {
  InvitationEmailComposer,
  SendStatusBanner,
} from "@/components/shared/invitation-email-composer";

export const Route = createFileRoute("/admin/administrators/$id/email-preview")({
  head: () => ({ meta: [{ title: "Administrator invitation email · TalVault Admin" }] }),
  component: AdminEmailPreviewPage,
});

function AdminEmailPreviewPage() {
  const { id } = useParams({ from: "/admin/administrators/$id/email-preview" });
  const getFn = useServerFn(getAdminInvitationById);
  const sendFn = useServerFn(sendAdminInvitationEmail);
  const resendFn = useServerFn(resendAdminInvitation);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "admin-invitation", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const inv = q.data as any;

  // A lapsed invitation carries a dead link: sending it again would just email
  // a link that fails on arrival, so the expiry has to be refreshed first.
  const isExpired =
    !!inv && effectiveInvitationStatus(inv.status, inv.expires_at) === "expired";

  const resendM = useMutation({
    mutationFn: () => resendFn({ data: { id, extend_days: 14 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "admin-invitation", id] });
      qc.invalidateQueries({ queryKey: ["admin", "admin-invitations"] });
      setStatus({ kind: "ok", message: "Expiry refreshed — this invitation can be sent again." });
      toast.success("Invitation reopened · expiry refreshed.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not refresh the expiry."),
  });

  const [subject, setSubject] = useState(DEFAULT_ADMIN_INVITATION_SUBJECT);
  const [body, setBody] = useState(DEFAULT_ADMIN_INVITATION_BODY);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const [origin, setOrigin] = useState("https://talvault.app");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const inviteUrl = inv ? `${origin}/invite/admin/${inv.token}` : "";
  const expiryDate = inv
    ? new Date(inv.expires_at).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  const sendM = useMutation({
    mutationFn: () => sendFn({ data: { id, subject, body, invite_url: inviteUrl } }),
    onSuccess: (res: any) => {
      if (res?.sent) {
        setStatus({ kind: "ok", message: `Email sent to ${inv?.email}.` });
        toast.success("Invitation email sent.");
        return;
      }
      const msg =
        res?.reason === "domain_unverified" || res?.reason === "email_not_configured"
          ? EMAIL_FALLBACK_NOTICE
          : `Send failed: ${res?.detail ?? "unknown error"}. Copy the link and send it yourself for now.`;
      setStatus({ kind: "error", message: msg });
      toast.error("Email not sent — see the status message.");
    },
    onError: (e: any) => {
      setStatus({
        kind: "error",
        message: `Send failed: ${e?.message ?? "unknown error"}. Copy the link and send it yourself for now.`,
      });
      toast.error("Email not sent — see the status message.");
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/administrators" className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to administrators
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>Administrator invitation email</h1>
          <div className="tvp-subtitle">
            Edit the subject and message, preview it exactly as the recipient sees it, then send.
            Tokens available: {"{{email}}"}, {"{{permission_level}}"}, {"{{expiry_date}}"}.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={copyLink} disabled={!inv} title="Copy the unique invite link">
            <Copy className="h-4 w-4" />Copy link
          </button>
          {isExpired && (
            <button
              className="tvp-secondary"
              onClick={() => { setStatus(null); resendM.mutate(); }}
              disabled={resendM.isPending}
              title="Extend the expiry by 14 days so the link works again"
            >
              <RefreshCw className="h-4 w-4" />
              {resendM.isPending ? "Refreshing…" : "Resend & refresh expiry"}
            </button>
          )}
          <button
            className="tvp-primary"
            disabled={!inv || isExpired || sendM.isPending || !subject.trim() || !body.trim()}
            title={
              isExpired
                ? "This invitation has lapsed — refresh the expiry before sending."
                : "Send this invitation email"
            }
            onClick={() => { setStatus(null); sendM.mutate(); }}
          >
            <Send className="h-4 w-4" />{sendM.isPending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>

      {isExpired && (
        <div className="tvp-card" style={{ borderLeft: "3px solid var(--tvp-red)" }}>
          <strong>This invitation has lapsed.</strong>{" "}
          <span className="tvp-muted">
            Its link no longer works, so sending it now would land the recipient on
            an expired page. Use “Resend &amp; refresh expiry” to reopen it for a
            further 14 days, then send the email.
          </span>
        </div>
      )}

      <SendStatusBanner status={status} />

      {q.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}
      {!q.isLoading && !inv && <div className="tvp-card tvp-muted">Invitation not found.</div>}

      {inv && (
        <InvitationEmailComposer
          variant="admin"
          subject={subject}
          setSubject={setSubject}
          body={body}
          setBody={setBody}
          defaultSubject={DEFAULT_ADMIN_INVITATION_SUBJECT}
          defaultBody={DEFAULT_ADMIN_INVITATION_BODY}
          recipientEmail={inv.email}
          inviteUrl={inviteUrl}
          expiryDate={expiryDate}
          tokens={{
            email: inv.email,
            permission_level: inv.permission_level,
            expiry_date: expiryDate,
            invite_url: inviteUrl,
          }}
        />
      )}
    </>
  );
}
