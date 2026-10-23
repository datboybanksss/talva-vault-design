import { createFileRoute } from "@tanstack/react-router";
import { PageBand, EmptyState } from "@/components/shared/brand";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/talent/budget")({
  head: () => ({
    meta: [
      { title: "Budget & Income · TalVault Talent" },
      {
        name: "description",
        content:
          "Budget & Income is coming soon to the TalVault Talent portal — a private place to follow the quotes and invoices your Manager shares with you.",
      },
      { property: "og:title", content: "Budget & Income · TalVault Talent" },
      {
        property: "og:description",
        content:
          "Coming soon: follow the quotes and invoices your Manager shares with you, in one private read-only place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  return (
    <>
      <PageBand icon={<Wallet />} title="Budget & Income" subtitle="Coming soon." />

      <div className="tvp-card tvp-panel">
        <EmptyState icon={<Wallet />} tint="lavender" title="Coming soon">
          Budget &amp; Income isn't ready yet. When it opens, you'll be able to follow the quotes and invoices your
          Manager shares with you — amounts, dates and payment status — all in one private, read-only place.
        </EmptyState>
      </div>
    </>
  );
}
