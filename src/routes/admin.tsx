import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { checkMfaGate, checkPortalAccess, resolveDeniedDestination } from "@/lib/portal-access";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin · TalVault" },
      {
        name: "description",
        content:
          "Platform operations console — agencies, invites, audit and administrators.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const access = await checkPortalAccess("admin");
    if (access === "denied") {
      // Wrong workspace for this account: send them to their own rather than
      // to an error screen.
      const dest = await resolveDeniedDestination("admin", location.href);
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
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }


    // Two-factor authentication is mandatory for every account, with no
    // permission-level exemption. The enrolment page must stay reachable.
    if (location.pathname === "/admin/enroll-2fa") return;
    const mfa = await checkMfaGate();
    if (mfa === "enrol") throw redirect({ to: "/enroll-2fa", search: { next: location.href } });
    if (mfa === "challenge") throw redirect({ to: "/auth", search: { next: location.href } });
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
