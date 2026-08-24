import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy path. Two-factor enrolment is now portal-agnostic and lives at
 * /enroll-2fa, so existing links land there with the admin console as the
 * destination once enrolment completes.
 */
export const Route = createFileRoute("/admin/enroll-2fa")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/enroll-2fa", search: { next: "/admin" } });
  },
  component: () => null,
});
