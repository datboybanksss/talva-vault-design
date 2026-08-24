import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AgencyShell } from "@/components/agency/agency-shell";
import { checkPortalAccess } from "@/lib/portal-access";

export const Route = createFileRoute("/agency")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agency · TalVault" },
      {
        name: "description",
        content:
          "Agency workspace — Talent, Invitations, Vault, Quotes & Invoices.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const access = await checkPortalAccess("agency");
    if (access !== "granted") {
      throw redirect({
        to: "/auth",
        search:
          access === "denied"
            ? { next: location.href, denied: "not_agency" }
            : { next: location.href },
      });
    }
  },
  component: AgencyLayout,
});

function AgencyLayout() {
  return (
    <AgencyShell>
      <Outlet />
    </AgencyShell>
  );
}
