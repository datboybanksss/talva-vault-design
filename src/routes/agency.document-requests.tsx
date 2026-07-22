import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/agency/document-requests")({
  beforeLoad: () => {
    throw redirect({ to: "/agency/document-vault", search: { tab: "Requests" } as any });
  },
  component: () => null,
});
