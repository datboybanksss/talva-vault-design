import { createFileRoute } from "@tanstack/react-router";
import { ClientsPanel } from "@/components/agency/clients-panel";

export const Route = createFileRoute("/agency/clients/")({
  head: () => ({
    meta: [
      { title: "Clients · TalVault" },
      {
        name: "description",
        content:
          "Your agency's client book — the companies and people you send quotes and invoices to.",
      },
      { property: "og:title", content: "Clients · TalVault" },
      {
        property: "og:description",
        content: "Save client details once and pick them on every quote and invoice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPanel,
});
