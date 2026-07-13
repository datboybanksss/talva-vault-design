import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/agencies")({
  component: () => <Outlet />,
});
