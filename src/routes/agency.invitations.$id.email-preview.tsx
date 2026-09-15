import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ArrowLeft, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { getTalentInvitationByIdMine, getStaffInvitationByIdMine } from "@/lib/agency.functions";
import { sendTalentInvitationEmail, sendStaffInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_TALENT_INVITATION_SUBJECT,
  DEFAULT_TALENT_INVITATION_BODY,
  DEFAULT_STAFF_INVITATION_SUBJECT,
  DEFAULT_STAFF_INVITATION_BODY,
  EMAIL_FALLBACK_NOTICE,
} from "@/lib/invitation-email";
import {
  InvitationEmailComposer,
  SendStatusBanner,
} from "@/components/shared/invitation-email-composer";

type InviteKind = "talent" | "staff";

export const Route = createFileRoute("/agency/invitations/$id/email-preview")({
  validateSearch: (search: Record<string, unknown>): { type: InviteKind } => ({
    type: search["type"] === "staff" ? "staff" : "talent",
  }),
  head: () => ({
    meta: [
      { title: "Invitation email · TalVault" },
      { name: "description", content: "Edit, preview and send the invitation email for a talent or staff invite." },
      { property: "og:title", content: "Invitation email · TalVault" },
      { property: "og:description", content: "Edit, preview and send the invitation email for a talent or staff invite." },
    ],
  }),
  component: EmailPreviewPage,
});

function EmailPreviewPage() {
  const { id } = useParams({ from: "/agency/invitations/$id/email-preview" });
  const { type } = Route.useSearch();
  const isStaff = type === "staff";

  const getTalentFn = useServerFn(getTalentInvitationByIdMine);
  const getStaffFn = useServerFn(getStaffInvitationByIdMine);
  const sendTalentFn = useServerFn(sendTalentInvitationEmail);
  const sendStaffFn = useServerFn(sendStaffInvitationEmail);

  const q = useQuery({
    queryKey: ["agency", "invitation-email", type, id],
    queryFn: () => (isStaff ? getStaffFn({ data: { id } }) : getTalentFn({ data: { id } })),
  });
  const inv = q.data as any;

  const defaultSubject = isStaff ? DEFAULT_STAFF_INVITATION_SUBJECT : DEFAULT_TALENT_INVITATION_SUBJECT;
  const defaultBody = isStaff ? DEFAULT_STAFF_INVITATION_BODY : DEFAULT_TALENT_INVITATION_BODY;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const [origin, setOrigin] = useState("https://talvault.app");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const inviteUrl = inv
    ? isStaff
      ? `${origin}/invite/${inv.token}`
      : `${origin}/invite/talent/${inv.token}`
    : "";
  const expiryDate = inv
    ? new Date(inv.expires_at).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  const sendM = useMutation({
    mutationFn: () => {
      const payload = { data: { id, subject, body, invite_url: inviteUrl } };
      return isStaff ? sendStaffFn(payload) : sendTalentFn(payload);
    },
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
          <Link to="/agency/invitations" className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>
            {isStaff ? "Staff invitation email" : "Talent invitation email"}
          </h1>
          <div className="tvp-subtitle">
            Edit the subject and message, preview it exactly as your {isStaff ? "staff member" : "talent"} sees it, then send.
            Tokens available: {isStaff ? "{{contact_person}}" : "{{talent_name}}"}, {"{{agency_name}}"}, {"{{email}}"}, {"{{expiry_date}}"}.
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
          variant={isStaff ? "staff" : "talent"}
          subject={subject}
          setSubject={setSubject}
          body={body}
          setBody={setBody}
          defaultSubject={defaultSubject}
          defaultBody={defaultBody}
          recipientEmail={inv.email}
          inviteUrl={inviteUrl}
          expiryDate={expiryDate}
          tokens={{
            talent_name: isStaff ? null : inv.talent_name,
            contact_person: isStaff ? inv.contact_person : null,
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
