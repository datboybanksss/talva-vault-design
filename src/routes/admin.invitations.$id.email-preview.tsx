import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ArrowLeft, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { getInvitationById } from "@/lib/admin.functions";
import { sendAgencyInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_INVITATION_SUBJECT,
  DEFAULT_INVITATION_BODY,
  EMAIL_FALLBACK_NOTICE,
} from "@/lib/invitation-email";
import {
  InvitationEmailComposer,
  SendStatusBanner,
} from "@/components/shared/invitation-email-composer";

export const Route = createFileRoute("/admin/invitations/$id/email-preview")({
  head: () => ({ meta: [{ title: "Invitation email · TalVault Admin" }] }),
  component: EmailPreviewPage,
});

function EmailPreviewPage() {
  const { id } = useParams({ from: "/admin/invitations/$id/email-preview" });
  const getFn = useServerFn(getInvitationById);
  const sendFn = useServerFn(sendAgencyInvitationEmail);
  const q = useQuery({
    queryKey: ["admin", "invitation", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const inv = q.data as any;

  const [subject, setSubject] = useState(DEFAULT_INVITATION_SUBJECT);
  const [body, setBody] = useState(DEFAULT_INVITATION_BODY);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const [origin, setOrigin] = useState("https://talvault.app");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const inviteUrl = inv ? `${origin}/invite/${inv.token}` : "";
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
          <Link to="/admin/invitations" search={{}} className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>Invitation email</h1>
          <div className="tvp-subtitle">
            Edit the subject and message, preview it exactly as the recipient sees it, then send.
            Tokens available: {"{{contact_person}}"}, {"{{agency_name}}"}, {"{{email}}"}, {"{{expiry_date}}"}.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={copyLink} disabled={!inv} title="Copy the unique invite link">
            <Copy className="h-4 w-4" />Copy link
          </button>
          <button
            className="tvp-primary"
            disabled={!inv || sendM.isPending || !subject.trim() || !body.trim()}
            onClick={() => { setStatus(null); sendM.mutate(); }}
          >
            <Send className="h-4 w-4" />{sendM.isPending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>

      <SendStatusBanner status={status} />

      {q.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}
      {!q.isLoading && !inv && <div className="tvp-card tvp-muted">Invitation not found.</div>}

      {inv && (
        <InvitationEmailComposer
          variant="agency"
          subject={subject}
          setSubject={setSubject}
          body={body}
          setBody={setBody}
          defaultSubject={DEFAULT_INVITATION_SUBJECT}
          defaultBody={DEFAULT_INVITATION_BODY}
          recipientEmail={inv.email}
          inviteUrl={inviteUrl}
          expiryDate={expiryDate}
          tokens={{
            contact_person: inv.contact_person,
            agency_name: inv.agency_name,
            email: inv.email,
            expiry_date: expiryDate,
            invite_url: inviteUrl,
          }}
        />
      )}
    </>
  );
}
