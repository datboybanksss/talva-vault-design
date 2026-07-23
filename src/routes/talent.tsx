import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { TalentShell } from "@/components/talent/talent-shell";
import { supabase } from "@/integrations/supabase/client";
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
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
  },
  loader: async () => {
    const ctx = await getTalentContext();
    if (!ctx.profile) {
      throw redirect({ to: "/auth", search: { next: "/talent" } });
    }
    return ctx;
  },
  component: TalentLayout,
});

function TalentLayout() {
  return (
    <TalentShell>
      <Outlet />
    </TalentShell>
  );
}
