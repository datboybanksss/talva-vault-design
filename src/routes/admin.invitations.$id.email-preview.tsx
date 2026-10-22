import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getSentAdminInviteEmail } from "@/lib/admin-invite-email.functions";
import { SentEmailView } from "@/components/admin/invite-email-review";
import { fmtLongDate } from "@/lib/notice-email";

/** "View sent email": the exact email last sent for an admin invitation, read-only. */
export const Route = createFileRoute("/admin/invitations/$id/email-preview")({
  validateSearch: (raw: Record<string, unknown>): { type: "agency" | "talent" } => ({
    type: raw.type === "talent" ? "talent" : "agency",
  }),
  head: () => ({
    meta: [
      { title: "Sent invitation email · TalVault Admin" },
      { name: "description", content: "The invitation email exactly as it was sent." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SentEmailPage,
});

function SentEmailPage() {
  const { id } = Route.useParams();
  const { type } = Route.useSearch();
  const getFn = useServerFn(getSentAdminInviteEmail);
  const q = useQuery({
    queryKey: ["admin", "sent-invite-email", type, id],
    queryFn: () => getFn({ data: { kind: type, id } }),
  });
  const d = q.data;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/invitations" search={{}} className="tvp-link tvp-back-link">
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1">Sent email</h1>
          <div className="tvp-subtitle">
            {d
              ? d.sentAt
                ? `Sent to ${d.name} on ${fmtLongDate(d.sentAt)}. This is a read-only copy.`
                : `Invitation to ${d.name}.`
              : "The invitation email exactly as it was sent."}
          </div>
        </div>
      </div>
      {q.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}
      {q.isError && <div className="tvp-card tvp-muted">We couldn't load this invitation.</div>}
      {d && !d.html && (
        <div className="tvp-card tvp-muted">
          There's no copy of this email. Either it hasn't been delivered yet, or it was sent before
          TalVault started keeping copies of sent invitation emails.
        </div>
      )}
      {d?.html && (
        <div className="tvp-card tvp-panel">
          <SentEmailView to={d.email} subject={d.subject ?? ""} html={d.html} text={d.text} />
        </div>
      )}
    </>
  );
}
