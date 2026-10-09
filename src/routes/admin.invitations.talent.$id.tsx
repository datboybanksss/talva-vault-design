import { createFileRoute } from "@tanstack/react-router";
import { TalentInviteForm } from "@/components/admin/talent-invite-form";

export const Route = createFileRoute("/admin/invitations/talent/$id")({
  head: () => ({
    meta: [
      { title: "Talent invitation · TalVault Admin" },
      { name: "description", content: "Edit a talent invitation draft, or resend or revoke a sent one." },
    ],
  }),
  component: TalentInvitePage,
});

function TalentInvitePage() {
  const { id } = Route.useParams();
  return <TalentInviteForm key={id} draftId={id} />;
}
