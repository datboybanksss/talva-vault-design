import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AgencyShell } from "@/components/agency/agency-shell";
import { supabase } from "@/integrations/supabase/client";

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
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    // Must be an active (non-suspended) member of at least one agency.
    const { data: member } = await supabase
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", userRes.user.id)
      .eq("suspended", false)
      .limit(1)
      .maybeSingle();
    if (!member) {
      throw redirect({ to: "/auth", search: { next: location.href } });
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
