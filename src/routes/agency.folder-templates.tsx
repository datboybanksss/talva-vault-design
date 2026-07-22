import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/agency/folder-templates")({
  beforeLoad: () => {
    throw redirect({ to: "/agency/settings", search: { tab: "folders" }, replace: true });
  },
});
