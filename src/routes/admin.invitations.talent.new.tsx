import { createFileRoute } from "@tanstack/react-router";
import { TalentInviteForm } from "@/components/admin/talent-invite-form";

export const Route = createFileRoute("/admin/invitations/talent/new")({
  head: () => ({
    meta: [
      { title: "Invite talent · TalVault Admin" },
      { name: "description", content: "Invite independent talent to TalVault with their ID document and proof of talent." },
    ],
  }),
  component: () => <TalentInviteForm />,
});
