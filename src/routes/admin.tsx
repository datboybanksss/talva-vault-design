import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { supabase } from "@/integrations/supabase/client";

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
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({
        to: "/auth",
        search: { next: location.href },
      });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }

    // 2FA gate: mandatory for main admin and admins with edit rights.
    // View-only admins are not forced to enroll. The enrollment page itself
    // must be reachable, so we skip the gate when already there.
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
