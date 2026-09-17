import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AgencyShell } from "@/components/agency/agency-shell";
import { checkMfaGate, checkPortalAccess, resolveDeniedDestination } from "@/lib/portal-access";

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
    if (access === "denied") {
      // Wrong workspace for this account: send them to their own rather than
      // to an error screen.
      const dest = await resolveDeniedDestination("agency", location.href);
      throw redirect({ to: dest.to as never, search: (dest.search ?? {}) as never });
    }
    if (access !== "granted") {
      throw redirect({
        to: "/auth",
        // A signed-out visitor, or a check that could not complete, just gets
        // the plain sign-in screen.
        search: { next: location.href },
      });
    }
    const mfa = await checkMfaGate();
    if (mfa === "enrol") throw redirect({ to: "/enroll-2fa", search: { next: location.href } });
    if (mfa === "challenge") throw redirect({ to: "/auth", search: { next: location.href } });
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
