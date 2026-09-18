import { createFileRoute } from "@tanstack/react-router";
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
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Budget &amp; Income</h1>
          <div className="tvp-subtitle">Coming soon.</div>
        </div>
      </div>

      <div className="tvp-card tvp-panel" style={{ textAlign: "center", padding: "56px 24px" }}>
        <div
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "var(--tv-surface-2, rgba(6,78,88,0.08))",
            color: "var(--tv-teal-700, #064E58)",
            marginBottom: 14,
          }}
        >
          <Wallet className="h-5 w-5" />
        </div>
        <h2 className="tvp-h2">Coming soon</h2>
        <p className="tvp-muted" style={{ marginTop: 8, maxWidth: 460, marginInline: "auto" }}>
          Budget &amp; Income isn't ready yet. When it opens, you'll be able to follow the quotes
          and invoices your Manager shares with you — amounts, dates and payment status — all in
          one private, read-only place.
        </p>
      </div>
    </>
  );
}
