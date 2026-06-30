import { Outlet, createFileRoute } from "@tanstack/react-router";
import { TalentShell } from "@/components/talent/talent-shell";

export const Route = createFileRoute("/talent")({
  head: () => ({
    meta: [
      { title: "Talent · TalVault" },
      {
        name: "description",
        content:
          "Your Private Vault, Agency Shared Folder, AI Review, sharing and budget — all in one calm, secure place.",
      },
    ],
  }),
  component: TalentLayout,
});

function TalentLayout() {
  return (
    <TalentShell>
      <Outlet />
    </TalentShell>
  );
}
