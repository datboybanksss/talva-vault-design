import { createFileRoute } from "@tanstack/react-router";
import { PageBand, IconTile } from "@/components/shared/brand";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/talent/budget")({
  head: () => ({
    meta: [
      { title: "Budget & Income — coming soon · TalVault Talent" },
      {
        name: "description",
        content:
          "Budget & Income is coming soon to TalVault — a private, read-only place to follow the quotes and invoices your agency shares with you.",
      },
      { property: "og:title", content: "Budget & Income — coming soon · TalVault Talent" },
      {
        property: "og:description",
        content:
          "Coming soon: follow the quotes and invoices your agency shares with you, in one private, read-only place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  return (
    <div className="tv-page">
      <PageBand
        icon={<Wallet />}
        title="Budget & Income — coming soon"
        subtitle="We're still building this part of TalVault."
      />
      <div className="tvp-card tv-tint-lavender tv-teaser">
        <IconTile icon={<Wallet />} tint="lavender" size="lg" />
        <h2>A clear view of your quotes and invoices</h2>
        <p>
          Budget &amp; Income will give you one private place to follow the quotes and invoices your
          agency shares with you. You'll be able to see:
        </p>
        <ul>
          <li>the amount on each quote and invoice</li>
          <li>its dates</li>
          <li>whether it has been paid</li>
        </ul>
        <p>
          Everything here will be read-only — only your agency can create or change these records.
        </p>
      </div>
    </div>
  );
}
