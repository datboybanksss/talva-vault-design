import { createFileRoute, redirect } from "@tanstack/react-router";

// Kept so old links and bookmarks still work: talent invitations now start
// from the single New invitation form.
export const Route = createFileRoute("/admin/invitations/talent/new")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/invitations/new", search: { type: "talent" }, replace: true });
  },
});
