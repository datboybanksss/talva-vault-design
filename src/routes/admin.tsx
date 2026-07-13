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
