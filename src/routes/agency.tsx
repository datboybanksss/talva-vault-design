import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AgencyShell } from "@/components/agency/agency-shell";

export const Route = createFileRoute("/agency")({
  head: () => ({
    meta: [
      { title: "Agency · TalVault" },
      {
        name: "description",
        content:
          "Agency workspace — Talent, Invitations, Vault, Quotes & Invoices.",
      },
    ],
  }),
  component: AgencyLayout,
});

function AgencyLayout() {
  return (
    <AgencyShell>
      <Outlet />
    </AgencyShell>
  );
}
