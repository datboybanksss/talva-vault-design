import { createFileRoute, notFound } from "@tanstack/react-router";
import { isUuid } from "@/lib/ids";
import { TalentInviteForm } from "@/components/admin/talent-invite-form";

export const Route = createFileRoute("/admin/invitations/talent/$id")({
  head: () => ({
    meta: [
      { title: "Talent invitation · TalVault Admin" },
      {
        name: "description",
        content: "Edit a talent invitation draft, or resend or revoke a sent one.",
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isUuid(params.id)) throw notFound();
  },
  notFoundComponent: () => <p className="tvp-muted">This invitation could not be found.</p>,
  component: TalentInvitePage,
});

function TalentInvitePage() {
  const { id } = Route.useParams();
  return <TalentInviteForm key={id} draftId={id} />;
}
