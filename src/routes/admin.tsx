import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { checkPortalAccess } from "@/lib/portal-access";

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
    if (access !== "granted") {
      throw redirect({
        to: "/auth",
        // Only a settled "denied" earns the banner. A signed-out visitor or a
        // check that could not complete just gets the plain sign-in screen.
        search:
          access === "denied"
            ? { next: location.href, denied: "not_admin" }
            : { next: location.href },
      });
    }
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }


    // Two-factor authentication is mandatory for the main admin and for admins
    // with edit rights. View-only admins are not forced to enrol. The enrolment
    // page itself must stay reachable, so the gate is skipped when already there.
    if (location.pathname === "/admin/enroll-2fa") return;
    const { data: role } = await supabase
      .from("user_roles")
      .select("is_main_admin, permission_level")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    const twoFaRequired =
      !!role?.is_main_admin || role?.permission_level === "edit";
    if (twoFaRequired) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).find(
        (f) => f.status === "verified",
      );
      if (!verified) {
        throw redirect({ to: "/admin/enroll-2fa" });
      }
    }
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
