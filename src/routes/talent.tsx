import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { TalentShell } from "@/components/talent/talent-shell";
import { checkMfaGate, checkPortalAccess, resolveDeniedDestination } from "@/lib/portal-access";
import { getTalentContext } from "@/lib/talent.functions";

export const Route = createFileRoute("/talent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Talent · TalVault" },
      {
        name: "description",
        content:
          "Your Private Vault, Agency Shared Folder, AI Review, sharing and budget — all in one calm, secure place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const access = await checkPortalAccess("talent");
    if (access === "denied") {
      // Wrong workspace for this account: send them to their own rather than
      // to an error screen.
      const dest = await resolveDeniedDestination("talent", location.href);
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
  loader: async () => getTalentContext(),
  component: TalentLayout,
});

function TalentLayout() {
  return (
    <TalentShell>
      <Outlet />
    </TalentShell>
  );
}
