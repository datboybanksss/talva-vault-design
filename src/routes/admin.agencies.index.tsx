import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old "Agencies" page — bookmarks land on Accounts filtered to agencies. */
export const Route = createFileRoute("/admin/agencies/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/accounts", search: { type: "agency" }, replace: true });
  },
});
