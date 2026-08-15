import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY diagnostic route — verifies the invitation email send path.
export const Route = createFileRoute("/api/public/email-selftest")({
  server: {
    handlers: {
      GET: async () => {
        const { buildInvitationEmail, DEFAULT_INVITATION_SUBJECT, DEFAULT_INVITATION_BODY } =
          await import("@/lib/invitation-email");
        const { sendInvitationEmail } = await import("@/lib/invitation-email.server");
        const mail = buildInvitationEmail({
          subject: DEFAULT_INVITATION_SUBJECT,
          body: DEFAULT_INVITATION_BODY,
          agencyName: "Self Test Agency",
          contactPerson: "Test",
          recipientEmail: "delivered@resend.dev",
          inviteUrl: "https://example.com/invite/abc",
          expiryDate: "1 January 2027",
        });
        const res = await sendInvitationEmail("delivered@resend.dev", mail);
        return Response.json(res);
      },
    },
  },
});
