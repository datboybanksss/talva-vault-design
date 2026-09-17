import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * TalVault has a single front door. There is no portal picker: people sign in
 * once and are taken to the workspace their own account belongs to.
 */
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · TalVault" },
      {
        name: "description",
        content:
          "Sign in to TalVault — the secure home for talent documents, agency operations and trusted contacts.",
      },
      { property: "og:title", content: "Sign in · TalVault" },
      {
        property: "og:description",
        content:
          "One secure sign-in for agencies, talent and platform administrators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: {} as never, replace: true });
  },
});
