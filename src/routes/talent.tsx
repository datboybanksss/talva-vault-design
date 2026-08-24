import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { TalentShell } from "@/components/talent/talent-shell";
import { checkPortalAccess } from "@/lib/portal-access";
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
    if (access !== "granted") {
      throw redirect({
        to: "/auth",
        search:
          access === "denied"
            ? { next: location.href, denied: "not_talent" }
            : { next: location.href },
      });
    }
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
