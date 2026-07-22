import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/agency/document-rules")({
  beforeLoad: () => {
    throw redirect({ to: "/agency/settings", search: { tab: "document-rules" }, replace: true });
  },
});
